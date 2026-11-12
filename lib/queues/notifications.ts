import { sql } from '@/lib/db/pool'

/**
 * Tells an agent when someone else puts them on a queue.
 *
 * Only fires for the team-lead/management path (applyBoardMovesAction), and
 * at most once per agent per board batch: a week plan or "copy today" sends
 * one summary rather than one per day. setMyQueueAction is deliberately
 * excluded — that is self-service, and notifying you about your own click is
 * noise. The same distinction the queue_reassignments audit trail already
 * draws via changed_by === user_id.
 *
 * Returns the new notification's id so the board's Undo can delete it again
 * (undoBoardChangesAction), or null when nothing was sent.
 *
 * Best-effort, exactly like notifyTeamLeadersIfOffTomorrow in
 * lib/roster/scheduleAlerts.ts: a notification failure must never surface
 * as an error on the assignment the caller actually cares about, because
 * the assignment itself has already committed by the time this runs.
 */
export async function notifyQueueAssignment(params: {
  agentId: string
  assignedBy: string
  /** The queue, or null when a multi-day batch puts the agent on different queues. */
  queue: string | null
  /** 'YYYY-MM-DD'. The single day, or the first of several. */
  date: string
  /** Number of distinct days placed in this batch — 1 for a single day. */
  days?: number
  /** True when every placement in the batch is an additional platform, not a main channel. */
  additional?: boolean
  reason?: string | null
}): Promise<string | null> {
  const { agentId, assignedBy, queue, date, days = 1, additional = false, reason } = params

  // Assigning yourself is not news.
  if (agentId === assignedBy) return null

  try {
    const [assigner] = await sql<{ full_name: string }[]>`
      SELECT full_name FROM profiles WHERE id = ${assignedBy}
    `
    const who = assigner?.full_name ?? 'A team leader'

    let title: string
    let body: string
    if (queue === null) {
      // Several queues in one batch (e.g. a main move plus an additional add).
      if (days > 1) {
        title = `Your queues for ${days} days are set`
        body = `${who} placed you on queues for ${days} days from ${date}.`
      } else {
        title = `Your queues for ${date} are set`
        body = `${who} placed you on several queues on ${date}.`
      }
    } else if (additional) {
      if (days > 1) {
        title = `You're also on ${queue} for ${days} days`
        body = `${who} added ${queue} as an additional platform for you for ${days} days from ${date}.`
      } else {
        title = `You're also on ${queue}`
        body = `${who} added ${queue} as an additional platform for you on ${date}.`
      }
    } else if (days > 1) {
      title = `You're on ${queue} for ${days} days`
      body = `${who} placed you on the ${queue} queue for ${days} days from ${date}.`
    } else {
      title = `You're on ${queue}`
      body = `${who} assigned you to the ${queue} queue on ${date}.`
    }
    const message = reason?.trim() ? `${body} Reason: ${reason.trim()}` : body

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO notifications (recipient_id, sender_id, related_profile_id, title, message, type)
      VALUES (${agentId}, ${assignedBy}, ${assignedBy}, ${title}, ${message}, 'queue_assignment')
      RETURNING id
    `
    return row?.id ?? null
  } catch (error) {
    console.error('notifyQueueAssignment failed', error)
    return null
  }
}
