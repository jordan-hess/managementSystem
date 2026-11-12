// Phase 2 (unified Tickets page) — relocated from lib/t2/queues.ts /
// app/(app)/t2/actions.ts now that "current queue" spans both T2 and Social.
// Pure date-math (mondayOf/weekDates) plus the one write primitive
// (upsertAssignmentWithAudit) every queue-assignment action funnels through
// — team-lead-assigns-someone-else (applyBoardMovesAction)
// and the new self-service setMyQueueAction alike, so every movement lands
// in queue_reassignments the same way regardless of who triggered it.

import { sql } from '@/lib/db/pool'

// Today's date in the same UTC calendar-day convention used everywhere else
// in the T2 domain (datetime('now'), nowIso(), etc.) — reads Postgres's own
// clock rather than the Node process clock, so it can't drift from the DB.
// Deliberately NOT `SELECT date('now')` — see the original lib/t2/queues.ts
// header comment (still present there) for why to_char sidesteps a real
// overload-resolution footgun with T2's date(text) compat shim.
export async function todayDate(): Promise<string> {
  const [row] = await sql<{ d: string }[]>`SELECT to_char(current_date, 'YYYY-MM-DD') AS d`
  return row.d
}

// Normalizes any 'YYYY-MM-DD' to the Monday of its ISO week, using UTC date
// math so this can't disagree with todayDate()/date('now').
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

// Given a Monday 'YYYY-MM-DD', returns all 7 dates Mon..Sun.
export function weekDates(mondayStr: string): string[] {
  const d = new Date(`${mondayStr}T00:00:00Z`)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d)
    x.setUTCDate(x.getUTCDate() + i)
    return x.toISOString().slice(0, 10)
  })
}

// Midday Queue Reassignment: every assignment/reassignment (single-day or
// week, self-service or team-lead-initiated) writes an append-only audit row
// to queue_reassignments alongside the agent_queue_assignments upsert —
// capturing the previous queue, new queue, reason, who made the change, and
// effective date/time. changed_by === user_id is itself the "this was
// self-service" signal — no separate flag needed.
//
// queue === null sends the agent to the bench: the assignment row is deleted
// instead of upserted, and the audit row records new_queue = NULL (history
// reads "{previous} -> bench"). Returns the previous queue and the audit row's
// id so a caller can offer Undo.
export async function upsertAssignmentWithAudit(
  tx: typeof sql, userId: string, queue: string | null, date: string, assignedBy: string, reason: string | null
): Promise<{ previousQueue: string | null; logId: string }> {
  const [existing] = await tx<{ queue: string }[]>`
    SELECT queue FROM agent_queue_assignments WHERE user_id = ${userId} AND date = ${date}
  `
  if (queue === null) {
    await tx`DELETE FROM agent_queue_assignments WHERE user_id = ${userId} AND date = ${date}`
  } else {
    await tx`
      INSERT INTO agent_queue_assignments (user_id, date, queue, assigned_by, updated_at)
      VALUES (${userId}, ${date}, ${queue}, ${assignedBy}, datetime('now'))
      ON CONFLICT (user_id, date) DO UPDATE SET
        queue = excluded.queue, assigned_by = excluded.assigned_by, updated_at = excluded.updated_at
    `
  }
  const [log] = await tx<{ id: string }[]>`
    INSERT INTO queue_reassignments (user_id, date, previous_queue, new_queue, reason, changed_by, kind)
    VALUES (${userId}, ${date}, ${existing?.queue ?? null}, ${queue}, ${reason}, ${assignedBy}, ${'main'})
    RETURNING id
  `
  return { previousQueue: existing?.queue ?? null, logId: log?.id }
}

// Additional platforms (agent_additional_queues): extra lanes an agent covers
// on a day on top of their main queue. One call adds (from = null), removes
// (to = null) or moves (both set) a single additional row, and writes one
// kind = 'additional' audit row for it. The caller enforces the rules (a main
// row exists, lanes don't clash, at most MAX_ADDITIONAL_QUEUES) with the
// agent's day locked.
export async function setAdditionalWithAudit(
  tx: typeof sql, userId: string, date: string, from: string | null, to: string | null, assignedBy: string, reason: string | null
): Promise<{ logId: string }> {
  if (from !== null) {
    await tx`DELETE FROM agent_additional_queues WHERE user_id = ${userId} AND date = ${date} AND queue = ${from}`
  }
  if (to !== null) {
    await tx`
      INSERT INTO agent_additional_queues (user_id, date, queue, created_by)
      VALUES (${userId}, ${date}, ${to}, ${assignedBy})
    `
  }
  const [log] = await tx<{ id: string }[]>`
    INSERT INTO queue_reassignments (user_id, date, previous_queue, new_queue, reason, changed_by, kind)
    VALUES (${userId}, ${date}, ${from}, ${to}, ${reason}, ${assignedBy}, ${'additional'})
    RETURNING id
  `
  return { logId: log?.id }
}

// Undo support for setAdditionalWithAudit, the additional-platform twin of
// restoreAssignment: swaps `current` back to `previous` (either may be null)
// without writing an audit row.
export async function restoreAdditional(
  tx: typeof sql, userId: string, date: string, current: string | null, previous: string | null
): Promise<void> {
  if (current !== null) {
    await tx`DELETE FROM agent_additional_queues WHERE user_id = ${userId} AND date = ${date} AND queue = ${current}`
  }
  if (previous !== null) {
    await tx`INSERT INTO agent_additional_queues (user_id, date, queue) VALUES (${userId}, ${date}, ${previous})`
  }
}

// Undo support: puts an agent's assignment back to what it was WITHOUT writing
// an audit row (the caller deletes the original audit row instead, so an undone
// move leaves no trace in history). null = no assignment row.
export async function restoreAssignment(
  tx: typeof sql, userId: string, date: string, queue: string | null, assignedBy: string
): Promise<void> {
  if (queue === null) {
    await tx`DELETE FROM agent_queue_assignments WHERE user_id = ${userId} AND date = ${date}`
    return
  }
  await tx`
    INSERT INTO agent_queue_assignments (user_id, date, queue, assigned_by, updated_at)
    VALUES (${userId}, ${date}, ${queue}, ${assignedBy}, datetime('now'))
    ON CONFLICT (user_id, date) DO UPDATE SET
      queue = excluded.queue, assigned_by = excluded.assigned_by, updated_at = excluded.updated_at
  `
}
