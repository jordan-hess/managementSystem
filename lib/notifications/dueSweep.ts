import { sql } from '@/lib/db/pool'
import { getAgentsOffOnDate } from '@/lib/roster/scheduleAlerts'
import { getRosterAt } from '@/lib/roster/onShift'
import { BUSINESS_TIMEZONE } from '@/lib/roster/calendarUtils'
import { chooseRecipients } from './callbackRecipients'
import { manualCallbackLabel } from '@/lib/callbacks/contact'

/**
 * Time-based notification sweeps, driven by the existing
 * 30-second poll (NotificationsProvider.tsx) instead of a scheduler.
 *
 * WHY THIS SHAPE. Both of these alerts are inherently time-driven: nothing
 * happens at the moment a callback or follow-up is created, only when it is
 * about to fall due. The usual answer is pg_cron, and
 * Database/migrations/callback-notifications.sql was written assuming it
 * ("enable it in the Supabase dashboard") — but Supabase is gone, pg_cron
 * is not installed on the self-managed cluster, and it isn't even in
 * pg_available_extensions. So send_callback_reminders() sat there, correct and never called, until this sweep replaced it: the reminder now lives in TypeScript (sweepCallbacksDueSoon below) because routing it to whoever is on shift needs the rotation engine. The SQL function is left in the database, unused.
 *
 * Every signed-in user already polls fetchNotificationsAction every 30s
 * (NotificationsProvider.tsx's POLL_INTERVAL_MS), so the cheapest correct
 * scheduler available is that poll. Piggy-backing on it costs one extra
 * statement on a request that was already happening — no new connection,
 * which matters against this cluster's hard 20-connection limit.
 *
 * TRADE-OFF, STATED PLAINLY: nothing fires while nobody has opsHub open.
 * During operating hours (the roster runs 08:00-20:00) someone always does,
 * so alerts land within ~30s. Outside them they queue up and fire when the
 * first person signs in — which is why the follow-up sweep below ignores
 * anything already well past due rather than firing a stale alert at dawn.
 *
 * If pg_cron or a cron job is ever available, run runDueSweeps from it and
 * remove the call from fetchNotificationsAction. Do NOT revive
 * send_callback_reminders(): it bypasses on-shift routing and would double-notify.
 */

/**
 * One arbitrary but fixed key, so every pod and every polling user contends
 * for the same lock. pg_try_advisory_lock returns immediately rather than
 * queueing, so the 39 callers who lose simply skip this tick instead of
 * piling up behind the one that won.
 */
const SWEEP_LOCK_KEY = 8_531_207

/** How far ahead of its due time a follow-up alert fires. */
const FOLLOWUP_LEAD_MINUTES = 10

/**
 * How far past due we still bother alerting. Without this, the first sign-in
 * of the morning would fire alerts for everything that fell due overnight,
 * which is noise rather than information.
 */
const FOLLOWUP_STALE_MINUTES = 60

export interface SweepResult {
  ran: boolean
  followupAlerts: number
  callbackReminders: number
}

/**
 * Best-effort. Never throws, and never blocks: a failure here must not stop
 * a user's notification list from loading, which is what they actually
 * asked for.
 */
export async function runDueSweeps(): Promise<SweepResult> {
  const idle: SweepResult = { ran: false, followupAlerts: 0, callbackReminders: 0 }

  try {
    const [lock] = await sql<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${SWEEP_LOCK_KEY}) AS locked`
    if (!lock?.locked) return idle

    try {
      // Callbacks: claimed and routed here rather than in SQL, because "who is on
      // shift" needs the rotation engine. Isolated so a failure here cannot stop
      // the follow-up sweep below.
      const callbackReminders = await sweepCallbacksDueSoon().catch((error) => {
        console.error('sweepCallbacksDueSoon failed', error)
        return 0
      })

      const followupAlerts = await sweepFollowupsDueSoon()
      return { ran: true, followupAlerts, callbackReminders }
    } finally {
      await sql`SELECT pg_advisory_unlock(${SWEEP_LOCK_KEY})`
    }
  } catch (error) {
    console.error('runDueSweeps failed', error)
    return idle
  }
}

/**
 * Follow-ups falling due in the next 10 minutes whose assigned agent is
 * rostered off that day — their team leaders get told, so someone can pick
 * it up before it breaches.
 *
 * Deliberately NOT a SQL function like the callback one: deciding whether an
 * agent is off needs the rotation engine (patterns, personal patterns,
 * overrides, attendance), which lives in lib/roster/resolveShift.ts.
 * Reimplementing that in plpgsql would fork the rotation logic, and the
 * 28-day-vs-30-day bug this codebase just fixed is a good argument against
 * having two copies of it.
 *
 * The claim is still done in SQL, in one atomic UPDATE ... RETURNING, so
 * concurrent callers cannot double-alert. Note the claim covers every
 * follow-up in the window, including ones whose agent turns out to be ON
 * shift: the 10-minute question has been answered for those too, and
 * re-asking it every 30 seconds until the due time passes would be wasted work.
 */
interface ClaimedFollowup {
  id: string
  agent_id: string
  /** ISO timestamp — lib/db/pool.ts keeps Postgres timestamps as strings. */
  due_date: string
  query_description: string
}

async function sweepFollowupsDueSoon(): Promise<number> {
  const claimed = await sql<ClaimedFollowup[]>`
    UPDATE followups
    SET due_alert_sent = TRUE
    WHERE id IN (
      SELECT id FROM followups
      WHERE due_alert_sent = FALSE
        AND status IN ('open', 'in_progress')
        AND agent_id IS NOT NULL
        AND due_date IS NOT NULL
        AND due_date <= (NOW() + (${FOLLOWUP_LEAD_MINUTES} || ' minutes')::interval)
        AND due_date >= (NOW() - (${FOLLOWUP_STALE_MINUTES} || ' minutes')::interval)
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, agent_id, due_date, query_description
  `
  if (claimed.length === 0) return 0

  // Group by due DATE, not per follow-up: resolving a shift is several
  // queries, and a batch of follow-ups due the same day needs it done once.
  const byDate = new Map<string, ClaimedFollowup[]>()
  for (const row of claimed) {
    const date = row.due_date.slice(0, 10)
    const bucket = byDate.get(date)
    if (bucket) bucket.push(row)
    else byDate.set(date, [row])
  }

  let sent = 0
  for (const [date, rows] of byDate) {
    const agentIds = [...new Set(rows.map((r) => r.agent_id))]
    const off = await getAgentsOffOnDate(agentIds, new Date(`${date}T00:00:00`))
    if (off.size === 0) continue

    for (const row of rows) {
      if (!off.has(row.agent_id)) continue
      sent += await alertLeaders(row)
    }
  }
  return sent
}

async function alertLeaders(row: ClaimedFollowup): Promise<number> {
  const [leaders, agentRows] = await Promise.all([
    sql<{ profile_id: string }[]>`
      SELECT DISTINCT tl.profile_id
      FROM team_members tm
      JOIN team_leaders tl ON tl.team_id = tm.team_id
      WHERE tm.profile_id = ${row.agent_id}
    `,
    sql<{ full_name: string }[]>`SELECT full_name FROM profiles WHERE id = ${row.agent_id}`,
  ])
  // Same "no leader to tell" no-op as notifyTeamLeadersIfOffTomorrow — not
  // an error, just nothing to do.
  if (leaders.length === 0) return 0

  const agentName = agentRows[0]?.full_name ?? 'An agent'
  const due = new Date(row.due_date).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
  const title = `Follow-up due at ${due} — ${agentName} is off`
  const description = row.query_description ?? ''
  const message = description.length > 200 ? `${description.slice(0, 200)}…` : description

  await Promise.all(
    leaders.map((l) => sql`
      INSERT INTO notifications (recipient_id, sender_id, followup_id, related_profile_id, title, message, type)
      VALUES (${l.profile_id}, ${row.agent_id}, ${row.id}, ${row.agent_id}, ${title}, ${message}, 'schedule_conflict')
    `),
  )
  return leaders.length
}

interface ClaimedCallback {
  id: string
  agent_id: string
  customer_id: string | null
  /** Manual callbacks only; the sweep deliberately never selects the phone/email. */
  contact_name: string | null
  /** Postgres timestamptz text (e.g. `2026-10-12 08:03:00+00`), which `new Date()` parses — lib/db/pool.ts keeps timestamps as strings. */
  scheduled_at: string
}

interface ReminderRow {
  recipientId: string
  senderId: string | null
  callbackId: string
  relatedProfileId: string | null
  title: string
  message: string
}

/**
 * Callbacks due in the next 5 minutes get a `reminder` notification (a pop-up
 * type). Who gets it depends on who is on shift at the due time — see
 * chooseRecipients. The claim is one atomic UPDATE ... RETURNING (the same
 * predicate the old SQL function used), so concurrent pollers cannot double-notify.
 * If anything after the claim fails, the claim is released so the reminder is
 * retried on the next tick instead of being silently lost.
 */
async function sweepCallbacksDueSoon(): Promise<number> {
  const claimed = await sql<ClaimedCallback[]>`
    UPDATE callbacks SET reminder_sent = TRUE
    WHERE status = 'pending'
      -- NULL once the agent's account is deleted (hard-delete-profiles-2026-10-29.sql);
      -- such a row has no one to remind and would fail the whole batch's insert.
      AND agent_id IS NOT NULL
      AND reminder_sent = FALSE
      AND scheduled_at > NOW()
      AND scheduled_at <= (NOW() + INTERVAL '5 minutes')
    RETURNING id, agent_id, customer_id, contact_name, scheduled_at
  `
  if (claimed.length === 0) return 0

  try {
    const rows = await buildCallbackReminders(claimed)
    if (rows.length === 0) return 0
    // One statement for the whole batch, so a failure inserts nothing and releasing the claim is safe.
    await sql`
      INSERT INTO notifications (recipient_id, sender_id, callback_id, related_profile_id, title, message, type)
      SELECT r, s, c, p, t, m, 'reminder'
      FROM unnest(
        ${rows.map((r) => r.recipientId)}::uuid[],
        ${rows.map((r) => r.senderId)}::uuid[],
        ${rows.map((r) => r.callbackId)}::uuid[],
        ${rows.map((r) => r.relatedProfileId)}::uuid[],
        ${rows.map((r) => r.title)}::text[],
        ${rows.map((r) => r.message)}::text[]
      ) AS x(r, s, c, p, t, m)
    `
    return rows.length
  } catch (error) {
    await sql`UPDATE callbacks SET reminder_sent = FALSE WHERE id = ANY(${claimed.map((c) => c.id)}) AND scheduled_at > NOW()`
    throw error
  }
}

async function buildCallbackReminders(claimed: ClaimedCallback[]): Promise<ReminderRow[]> {
  const agentIds = [...new Set(claimed.map((c) => c.agent_id))]
  const [customers, agents, ownLeaderLinks, leaderRows] = await Promise.all([
    sql<{ id: string; name: string }[]>`SELECT id, name FROM customers WHERE id = ANY(${[...new Set(claimed.map((c) => c.customer_id).filter((id): id is string => id !== null))]})`,
    sql<{ id: string; full_name: string }[]>`SELECT id, full_name FROM profiles WHERE id = ANY(${agentIds})`,
    sql<{ agent_id: string; leader_id: string }[]>`
      SELECT DISTINCT tm.profile_id AS agent_id, tl.profile_id AS leader_id
      FROM team_members tm
      JOIN team_leaders tl ON tl.team_id = tm.team_id
      JOIN profiles p ON p.id = tl.profile_id AND p.is_active
      WHERE tm.profile_id = ANY(${agentIds})
    `,
    sql<{ profile_id: string }[]>`SELECT DISTINCT tl.profile_id FROM team_leaders tl JOIN profiles p ON p.id = tl.profile_id AND p.is_active`,
  ])
  const customerName = new Map(customers.map((c) => [c.id, c.name]))
  const agentName = new Map(agents.map((a) => [a.id, a.full_name]))
  const allLeaderIds = leaderRows.map((l) => l.profile_id)

  // Resolving a shift is several queries: do it once per distinct due time, for everyone involved.
  const byDueTime = new Map<string, ClaimedCallback[]>()
  for (const cb of claimed) {
    const bucket = byDueTime.get(cb.scheduled_at)
    if (bucket) bucket.push(cb)
    else byDueTime.set(cb.scheduled_at, [cb])
  }

  const rows: ReminderRow[] = []
  for (const [dueAt, callbacks] of byDueTime) {
    const people = [...new Set([...callbacks.map((c) => c.agent_id), ...allLeaderIds])]
    const { onShift, unrostered } = await getRosterAt(people, new Date(dueAt))
    const time = new Date(dueAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: BUSINESS_TIMEZONE })

    for (const cb of callbacks) {
      const customer = cb.customer_id ? (customerName.get(cb.customer_id) ?? 'a customer') : manualCallbackLabel(cb.contact_name)
      const agent = agentName.get(cb.agent_id) ?? 'An agent'
      const { recipientIds, toLeaders } = chooseRecipients({
        agentId: cb.agent_id,
        ownLeaderIds: ownLeaderLinks.filter((l) => l.agent_id === cb.agent_id).map((l) => l.leader_id),
        allLeaderIds,
        onShift,
        unrostered,
      })
      for (const recipientId of recipientIds) {
        rows.push(toLeaders
          ? {
              recipientId, senderId: cb.agent_id, callbackId: cb.id, relatedProfileId: cb.agent_id,
              title: `Callback due at ${time} — ${agent} is off shift`,
              message: `${agent} has a callback with ${customer} at ${time} and is not on shift. Please cover it.`,
            }
          : {
              recipientId, senderId: null, callbackId: cb.id, relatedProfileId: null,
              title: `Upcoming Callback: ${customer}`,
              message: `You have a callback with ${customer} scheduled in 5 minutes.`,
            })
      }
    }
  }
  return rows
}
