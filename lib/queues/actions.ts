'use server'

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { requireUser } from '@/lib/auth/requireUser'
import {
  todayDate, upsertAssignmentWithAudit, restoreAssignment, setAdditionalWithAudit, restoreAdditional,
} from './assignments'
import { ASSIGNABLE_QUEUES, MAX_ADDITIONAL_QUEUES } from './constants'
import { laneOf } from './board'
import { notifyQueueAssignment } from './notifications'
import { canManageQueueAssignment } from '@/lib/auth/authz'
import { QueueReassignment } from '@/types'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

/**
 * Self-service — any authenticated user sets their OWN current queue, no
 * role gate beyond "has a session." Coexists with applyBoardMovesAction below
 * (team lead moves someone else's queue) — both funnel through the same
 * upsertAssignmentWithAudit, so every movement is recorded in
 * queue_reassignments the same way regardless of who triggered it.
 * changed_by === user_id on the resulting audit row is itself the
 * "self-service" signal.
 *
 * Picking the lane of one of your own additional platforms as your main
 * queue drops that additional (the main now covers it), audited the same
 * way. A removed lane (e.g. freescout) has no lane, so additionals are kept.
 */
export async function setMyQueueAction(queue: string, reason?: string): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (!ASSIGNABLE_QUEUES.includes(queue)) return { error: `queue must be one of: ${ASSIGNABLE_QUEUES.join(', ')}` }

  try {
    const d = await todayDate()
    await withTransaction(async (tx) => {
      const t = tx as unknown as typeof sql
      // The upsert writes (and so locks) the main row first, the same lock
      // the board takes before touching this agent's day.
      await upsertAssignmentWithAudit(t, auth.userId, queue, d, auth.userId, reason ?? null)
      const lane = laneOf(queue)
      if (lane === null) return
      const additionals = await t<{ queue: string }[]>`
        SELECT queue FROM agent_additional_queues WHERE user_id = ${auth.userId} AND date = ${d}
      `
      for (const { queue: value } of additionals) {
        if (laneOf(value) === lane) await setAdditionalWithAudit(t, auth.userId, d, value, null, auth.userId, null)
      }
    })
    return { data: true }
  } catch (error) {
    console.error('setMyQueueAction failed', error)
    return { error: 'Could not update your queue.' }
  }
}

export async function getMyQueueAction(): Promise<ActionResult<{ queue: string | null }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  try {
    const d = await todayDate()
    const [row] = await sql<{ queue: string }[]>`
      SELECT queue FROM agent_queue_assignments WHERE user_id = ${auth.userId} AND date = ${d}
    `
    return { data: { queue: row?.queue ?? null } }
  } catch (error) {
    console.error('getMyQueueAction failed', error)
    return { error: 'Could not load your queue.' }
  }
}

// ─── Queue Board batch moves (Team Lead and above) ──────────────────────────
// Every board mutation (single drag, auto-fill, clear, copy) is one
// applyBoardMovesAction call; Undo replays its result through
// undoBoardChangesAction. queue === null means "send to the bench".
//
// A move is either the agent's main queue (kind 'main', the default) or one
// of their additional platforms (kind 'additional'). For an additional,
// `from` is the stored additional value being moved or removed (null = add)
// and `queue` is the target lane (null = remove).

export interface BoardMove {
  userId: string
  date: string
  /** Missing means 'main'. */
  kind?: 'main' | 'additional'
  /** The queue the client believes the agent is on for that date (null =
   *  bench). The server refuses the batch if it no longer matches, so a stale
   *  board can't silently overwrite another lead's change. */
  from: string | null
  queue: string | null
}
export interface BoardChange extends BoardMove {
  previousQueue: string | null
  logId: string | null
  /** The one notification this batch sent the agent (shared by all their
   *  changes in it), or null when none was sent. Undo deletes it. */
  notificationId: string | null
}

const MAX_BOARD_MOVES = 200
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const STALE_BOARD = 'Someone else has changed this board since. Refresh and try again.'

// A board rule the move breaks (e.g. a fourth channel). Its message goes back
// to the lead as-is. Not exported: a 'use server' file may only export async
// functions.
class BoardRuleError extends Error {}

// Shape checks shared by apply and undo (server actions can be called directly
// with any payload). Returns an error message, or null when valid.
function validateBoardItems(
  items: (BoardMove & { previousQueue?: string | null; logId?: string | null; notificationId?: string | null })[],
  mode: 'apply' | 'undo',
): string | null {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_BOARD_MOVES) {
    return `Send between 1 and ${MAX_BOARD_MOVES} moves.`
  }
  const seen = new Set<string>()
  for (const m of items) {
    if (!m.userId || !DATE_RE.test(m.date)) return 'Each move needs a user and a YYYY-MM-DD date.'
    if (m.from === undefined) return 'Each move needs the queue it is moving from.'
    if (m.kind !== undefined && m.kind !== 'main' && m.kind !== 'additional') return "kind must be 'main' or 'additional'."
    for (const q of [m.queue, m.from, m.previousQueue ?? null]) {
      if (q !== null && !ASSIGNABLE_QUEUES.includes(q)) return `queue must be one of: ${ASSIGNABLE_QUEUES.join(', ')}`
    }
    if (m.notificationId !== undefined && m.notificationId !== null && typeof m.notificationId !== 'string') {
      return 'notificationId must be a string or null.'
    }
    if (mode === 'undo') {
      // Every change the board produces carries the audit row it wrote. Undo
      // keys by it rather than by agent-day: one batch can legitimately touch
      // the same additional twice (added, then dropped by a bench move).
      if (typeof m.logId !== 'string' || !m.logId) return 'Each change needs its log id.'
      if (seen.has(m.logId)) return 'Each change can only be undone once.'
      seen.add(m.logId)
      continue
    }
    // One main move per agent-day, and one move per additional value, so a
    // main move and additional moves for the same day can share a batch.
    const key = m.kind === 'additional' ? `${m.userId}|${m.date}|add|${m.from ?? m.queue}` : `${m.userId}|${m.date}|main`
    if (seen.has(key)) return 'An agent can only be moved once per day in a batch.'
    seen.add(key)
  }
  return null
}

export async function applyBoardMovesAction(moves: BoardMove[], reason?: string): Promise<ActionResult<BoardChange[]>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (!canManageQueueAssignment(auth.role)) return { error: 'Forbidden' }
  const invalid = validateBoardItems(moves, 'apply')
  if (invalid) return { error: invalid }

  try {
    const ids = [...new Set(moves.map((m) => m.userId))]
    const agents = await sql<{ id: string }[]>`
      SELECT id FROM profiles WHERE id = ANY(${ids}::uuid[]) AND role = 'agent' AND is_active
    `
    if (agents.length !== ids.length) return { error: 'Agent not found' }

    const changes = await withTransaction(async (tx) => {
      const t = tx as unknown as typeof sql
      const done: Omit<BoardChange, 'notificationId'>[] = []
      for (const m of moves) {
        // Locked so a concurrent board save can't slip in between this check
        // and the write below. The additionals are locked too (only rows that
        // exist can be; the main row's lock covers an agent's empty day).
        const [current] = await t<{ queue: string }[]>`
          SELECT queue FROM agent_queue_assignments WHERE user_id = ${m.userId} AND date = ${m.date} FOR UPDATE
        `
        const additionals = (await t<{ queue: string }[]>`
          SELECT queue FROM agent_additional_queues WHERE user_id = ${m.userId} AND date = ${m.date} FOR UPDATE
        `).map((r) => r.queue)
        const main = current?.queue ?? null

        if (m.kind === 'additional') {
          // Stale: the additional being moved or removed is gone. Throwing
          // rolls back the batch's earlier writes too.
          if (m.from !== null && !additionals.includes(m.from)) throw new Error(STALE_BOARD)
          if (m.from === m.queue) continue
          if (m.queue !== null) {
            if (main === null) throw new BoardRuleError('Give them a main channel first.')
            const lane = laneOf(m.queue)
            const others = additionals.filter((a) => a !== m.from)
            if (lane === null || lane === laneOf(main) || others.some((a) => laneOf(a) === lane)) {
              throw new BoardRuleError('They already cover that channel.')
            }
            if (m.from === null && additionals.length >= MAX_ADDITIONAL_QUEUES) throw new BoardRuleError('Already on 3 channels')
          }
          const { logId } = await setAdditionalWithAudit(t, m.userId, m.date, m.from, m.queue, auth.userId, reason ?? null)
          done.push({ ...m, kind: 'additional', previousQueue: m.from, logId })
          continue
        }

        // The client's view is stale: someone else moved this agent since.
        if (main !== m.from) throw new Error(STALE_BOARD)
        if (main === m.queue) continue
        const { previousQueue, logId } = await upsertAssignmentWithAudit(t, m.userId, m.queue, m.date, auth.userId, reason ?? null)
        done.push({ ...m, kind: 'main', previousQueue, logId })
        // The new main now covers an additional on its lane, so that one goes.
        // The bench takes every additional with it: an additional needs a main.
        const lane = laneOf(m.queue)
        for (const a of additionals) {
          if (m.queue !== null && (lane === null || laneOf(a) !== lane)) continue
          const removed = await setAdditionalWithAudit(t, m.userId, m.date, a, null, auth.userId, null)
          done.push({ userId: m.userId, date: m.date, kind: 'additional', from: a, queue: null, previousQueue: a, logId: removed.logId })
        }
      }
      return done
    })

    // After the commit, not inside it: only tell agents about moves that
    // stuck. One notification per agent per batch (a week plan is one
    // summary, not seven); bench moves aren't notified. Additional adds and
    // moves count as placements; removals, like the bench, don't.
    const placed = new Map<string, { date: string; queue: string; additional: boolean }[]>()
    for (const c of changes) {
      if (c.queue === null) continue
      placed.set(c.userId, [...(placed.get(c.userId) ?? []), { date: c.date, queue: c.queue, additional: c.kind === 'additional' }])
    }
    const notificationIds = new Map<string, string | null>()
    for (const [agentId, days] of placed) {
      const dates = [...new Set(days.map((d) => d.date))].sort()
      const queues = new Set(days.map((d) => d.queue))
      const id = await notifyQueueAssignment({
        agentId,
        assignedBy: auth.userId,
        queue: queues.size === 1 ? days[0].queue : null,
        date: dates[0],
        days: dates.length,
        additional: days.every((d) => d.additional),
        reason,
      })
      notificationIds.set(agentId, id ?? null)
    }
    return { data: changes.map((c) => ({ ...c, notificationId: notificationIds.get(c.userId) ?? null })) }
  } catch (error) {
    if (error instanceof Error && error.message === STALE_BOARD) return { error: STALE_BOARD }
    if (error instanceof BoardRuleError) return { error: error.message }
    console.error('applyBoardMovesAction failed', error)
    return { error: 'Could not save the board.' }
  }
}

export async function undoBoardChangesAction(changes: BoardChange[]): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (!canManageQueueAssignment(auth.role)) return { error: 'Forbidden' }
  const invalid = validateBoardItems(changes, 'undo')
  if (invalid) return { error: invalid }

  try {
    await withTransaction(async (tx) => {
      const t = tx as unknown as typeof sql
      // Replayed in reverse, so a later change in the batch is undone before an
      // earlier one it built on (e.g. an additional moved onto a lane, then
      // dropped by a main move there). Main changes go first so an agent's
      // main is back before their additionals are; main and additional undos
      // check and touch separate rows, so that doesn't change the end state.
      const replay = [...changes].reverse()
      replay.sort((a, b) => Number(a.kind === 'additional') - Number(b.kind === 'additional'))

      // Lock and read each agent-day the undo touches, then replay it in
      // memory first: each change must still be current (someone else may have
      // moved the agent since), and the day it leaves behind must still keep
      // the board's rules, since another lead may have filled the slot or
      // lane in the meantime. Checked on the end state, not per step, because
      // a batch's own changes can pass through an in-between state (main back
      // on a lane its additional still holds) that the next step clears.
      const days = new Map<string, { main: string | null; additionals: string[] }>()
      for (const c of replay) {
        const key = `${c.userId}|${c.date}`
        if (days.has(key)) continue
        const [current] = await t<{ queue: string }[]>`
          SELECT queue FROM agent_queue_assignments WHERE user_id = ${c.userId} AND date = ${c.date} FOR UPDATE
        `
        const additionals = (await t<{ queue: string }[]>`
          SELECT queue FROM agent_additional_queues WHERE user_id = ${c.userId} AND date = ${c.date} FOR UPDATE
        `).map((r) => r.queue)
        days.set(key, { main: current?.queue ?? null, additionals })
      }
      for (const c of replay) {
        const day = days.get(`${c.userId}|${c.date}`)!
        if (c.kind === 'additional') {
          if (c.queue !== null && !day.additionals.includes(c.queue)) throw new Error(STALE_BOARD)
          if (c.previousQueue !== null && day.additionals.includes(c.previousQueue)) throw new Error(STALE_BOARD)
          day.additionals = day.additionals.filter((a) => a !== c.queue)
          if (c.previousQueue !== null) day.additionals.push(c.previousQueue)
        } else {
          if (day.main !== c.queue) throw new Error(STALE_BOARD)
          day.main = c.previousQueue
        }
      }
      for (const { main, additionals } of days.values()) {
        const lanes = additionals.map(laneOf)
        const clash = lanes.some((l, i) => l === null || l === laneOf(main) || lanes.indexOf(l) !== i)
        if (additionals.length > MAX_ADDITIONAL_QUEUES || (additionals.length > 0 && main === null) || clash) {
          throw new Error(STALE_BOARD)
        }
      }

      for (const c of replay) {
        // Bind the undo to a log row this caller actually wrote for exactly this
        // change - proves the change is real and stops undo being a blind write.
        if (c.kind === 'additional') {
          const deleted = await t<{ id: string }[]>`
            DELETE FROM queue_reassignments
            WHERE id = ${c.logId} AND changed_by = ${auth.userId} AND user_id = ${c.userId} AND date = ${c.date}
              AND new_queue IS NOT DISTINCT FROM ${c.queue} AND previous_queue IS NOT DISTINCT FROM ${c.previousQueue}
              AND kind = 'additional'
            RETURNING id
          `
          if (deleted.length === 0) throw new Error(STALE_BOARD)
          await restoreAdditional(t, c.userId, c.date, c.queue, c.previousQueue)
          continue
        }
        const deleted = await t<{ id: string }[]>`
          DELETE FROM queue_reassignments
          WHERE id = ${c.logId} AND changed_by = ${auth.userId} AND user_id = ${c.userId} AND date = ${c.date}
            AND new_queue IS NOT DISTINCT FROM ${c.queue} AND previous_queue IS NOT DISTINCT FROM ${c.previousQueue}
            AND kind = 'main'
          RETURNING id
        `
        if (deleted.length === 0) throw new Error(STALE_BOARD)
        await restoreAssignment(t, c.userId, c.date, c.previousQueue, auth.userId)
      }
      // Retract what the batch told each agent. Bound to the recipient, to me
      // as sender and to the queue type, so a forged id can't touch anything
      // else; one already dismissed/deleted (or never sent) is simply absent.
      const notified = new Map<string, Set<string>>()
      for (const c of changes) {
        if (c.notificationId) notified.set(c.userId, new Set([...(notified.get(c.userId) ?? []), c.notificationId]))
      }
      for (const [agentId, ids] of notified) {
        await t`
          DELETE FROM notifications
          WHERE id = ANY(${[...ids]}::uuid[]) AND recipient_id = ${agentId}
            AND sender_id = ${auth.userId} AND type = 'queue_assignment'
        `
      }
    })
    return { data: true }
  } catch (error) {
    if (error instanceof Error && error.message === STALE_BOARD) return { error: STALE_BOARD }
    console.error('undoBoardChangesAction failed', error)
    return { error: 'Could not undo.' }
  }
}

// ─── queue reassignment history (Agent: own only; Team Lead/Management: all) ─

export interface QueueHistoryRow {
  date: string
  previous_queue: string | null
  new_queue: QueueReassignment['new_queue']
  reason: string | null
  effective_at: string | null
  kind: QueueReassignment['kind']
  /** NULL if the account this row was about has since been hard-deleted
   *  (user_id is ON DELETE SET NULL - see queue-reassignments-preserve-
   *  history-2026-09-18.sql - the row itself is kept). */
  agent_name: string | null
  changed_by_name: string | null
}

export async function getQueueHistoryAction(
  filters: {
    from?: string
    to?: string
    userId?: string
    /**
     * "Only my own changes", whatever my role. MyQueueWidget needs this:
     * it is a personal widget but it renders for every role, and without
     * this an admin's own "This week" list would quietly show the whole
     * department's queue movements, since the agent-scoping below only
     * applies to role = 'agent'.
     * It also limits the list to main-queue rows: the widget shows the main
     * queue only, not additional platforms.
     */
    mine?: boolean
  } = {},
): Promise<ActionResult<QueueHistoryRow[]>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  // Agents only ever see their own history — Team Lead/Management see
  // whichever agent the filter asks for, or everyone if none given.
  const scopedUserId = filters.mine || auth.role === 'agent' ? auth.userId : filters.userId

  try {
    const rows = await sql<QueueHistoryRow[]>`
      SELECT qr.date, qr.previous_queue, qr.new_queue, qr.reason, qr.effective_at, qr.kind,
             p.full_name AS agent_name, cb.full_name AS changed_by_name
      FROM queue_reassignments qr
      LEFT JOIN profiles p ON p.id = qr.user_id
      LEFT JOIN profiles cb ON cb.id = qr.changed_by
      WHERE (${scopedUserId ?? null}::uuid IS NULL OR qr.user_id = ${scopedUserId ?? null}::uuid)
        AND (${filters.from ?? null}::text IS NULL OR qr.date >= ${filters.from ?? null}::text)
        AND (${filters.to ?? null}::text IS NULL OR qr.date <= ${filters.to ?? null}::text)
        ${filters.mine ? sql`AND qr.kind = 'main'` : sql``}
      ORDER BY qr.effective_at DESC
      LIMIT 200
    `
    return { data: rows }
  } catch (error) {
    console.error('getQueueHistoryAction failed', error)
    return { error: 'Could not load queue history.' }
  }
}
