/**
 * "Tickets worked" — a day an agent touched a ticket/follow-up/escalation/
 * support ticket/callback, as DISTINCT from "Completed by You"
 * (components/home/MyCompletedWorkConsole.tsx / T2CompletedWorkConsole.tsx),
 * which only ever counts the single day something was finally resolved.
 *
 * The brief: creating a follow-up should count as a ticket worked THAT day,
 * and completing it later (possibly a different day) should count AGAIN on
 * that later day — both as "a ticket worked" and (unchanged, via the
 * existing resolved_at-based tiles) as "a follow-up done." Escalating a
 * ticket, or moving it to Follow Up, are themselves days worked too, not
 * just creation and final resolution — so this derives from the real
 * per-event history already recorded for each entity, not just two fixed
 * points, wherever that history exists:
 *
 *   - tickets (T2 + Billing): `ticket_events` already logs creation AND
 *     every status change with the acting user_id — nothing new to add.
 *     (The one gap: an auto-triggered open->in_progress transition logs
 *     user_id NULL, correctly excluded here since it's not a real agent
 *     action.)
 *   - followups (incl. escalations) / support_tickets: `followup_status_history`
 *     / `support_ticket_status_history` log every STATUS CHANGE, but not
 *     creation — so creation day is read off the entity's own
 *     created_at/created_by instead.
 *   - callbacks: no history table at all — only the two points the row
 *     itself records (created_at/created_by, completed_at/agent_id).
 *
 * Attribution follows the same split already established by the existing
 * "Completed by You" queries (app/(app)/dashboard/page.tsx,
 * app/(app)/home/page.tsx): creation-day credit goes to whoever actually
 * created the record (`created_by` — the agent themselves for self-service,
 * or a Team Lead/Management for an assigned one), later-day credit goes to
 * whoever performed THAT specific action (`changed_by` from a history row,
 * or `agent_id`/`user_id` at that point) — these can legitimately be
 * different people, same as creator vs. current assignee already are
 * elsewhere in this app.
 *
 * Returned as plain 'YYYY-MM-DD' day strings (one entry per ticket-day
 * worked, already deduplicated per source) rather than a pre-aggregated
 * count, so the client keeps using its own existing Day/Week/Month/Custom
 * period-matching helpers unchanged — same "fetch raw rows, filter
 * client-side" shape "Completed by You" already uses.
 */

import { sql } from '@/lib/db/pool'

function dayStrings(rows: { day: string | null }[]): string[] {
  return rows.map((r) => r.day).filter((d): d is string => d !== null)
}

/** T2 + Billing tickets, via ticket_events. */
export async function getTicketEventsWorkedDays(agentId: string): Promise<string[]> {
  const rows = await sql<{ day: string }[]>`
    SELECT DISTINCT ticket_id, created_at::date AS day
    FROM ticket_events
    WHERE user_id = ${agentId}
  `
  return dayStrings(rows)
}

/** Follow-ups and escalations (followups.type = 'escalation'). */
export async function getFollowupsWorkedDays(agentId: string): Promise<string[]> {
  const [created, changed] = await Promise.all([
    sql<{ day: string }[]>`SELECT created_at::date AS day FROM followups WHERE created_by = ${agentId}`,
    sql<{ day: string }[]>`SELECT changed_at::date AS day FROM followup_status_history WHERE changed_by = ${agentId}`,
  ])
  return [...dayStrings(created), ...dayStrings(changed)]
}

/** Social support tickets (Freescout/WhatsApp/HelloPeter). */
export async function getSupportTicketsWorkedDays(agentId: string): Promise<string[]> {
  const [created, changed] = await Promise.all([
    sql<{ day: string }[]>`SELECT created_at::date AS day FROM support_tickets WHERE created_by = ${agentId}`,
    sql<{ day: string }[]>`SELECT changed_at::date AS day FROM support_ticket_status_history WHERE changed_by = ${agentId}`,
  ])
  return [...dayStrings(created), ...dayStrings(changed)]
}

/** Callbacks — no status-history table, so just the two points the row itself records. */
export async function getCallbacksWorkedDays(agentId: string): Promise<string[]> {
  const [created, completed] = await Promise.all([
    sql<{ day: string }[]>`SELECT created_at::date AS day FROM callbacks WHERE created_by = ${agentId}`,
    sql<{ day: string }[]>`SELECT completed_at::date AS day FROM callbacks WHERE agent_id = ${agentId} AND completed_at IS NOT NULL`,
  ])
  return [...dayStrings(created), ...dayStrings(completed)]
}

/**
 * Combined helper for the CMS-agent "Completed by You" console
 * (app/(app)/dashboard/page.tsx) — follow-ups/escalations, support tickets,
 * callbacks, and any T2/Billing tickets this agent also happens to touch.
 */
export async function getAllTicketsWorkedDays(agentId: string): Promise<string[]> {
  const [events, followups, supportTickets, callbacks] = await Promise.all([
    getTicketEventsWorkedDays(agentId),
    getFollowupsWorkedDays(agentId),
    getSupportTicketsWorkedDays(agentId),
    getCallbacksWorkedDays(agentId),
  ])
  return [...events, ...followups, ...supportTickets, ...callbacks]
}
