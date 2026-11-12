import { sql } from '@/lib/db/pool'
import { ActiveAssistanceSource, TicketActivityEventType } from '@/types'

interface LogActivityEntry {
  sourceType: ActiveAssistanceSource
  sourceId: string
  customerId: string
  eventType: TicketActivityEventType
  actorId: string | null
  fromAgentId?: string | null
  toAgentId?: string | null
  note?: string | null
}

/**
 * Appends one row to ticket_activity_log. Scoped narrowly for this phase —
 * only the new code this feature introduces (createWithDuplicateCheck,
 * the claim/reassign action) calls this; retrofitting audit logging onto
 * the ~20 pre-existing status/assignment mutations across
 * support-tickets/actions.ts and t2/actions.ts is a separate, deferred
 * follow-up (see Database/migrations/customer-active-assistance.sql).
 */
export async function logTicketActivity(tx: typeof sql, entry: LogActivityEntry): Promise<void> {
  await tx`
    INSERT INTO ticket_activity_log (source_type, source_id, customer_id, event_type, actor_id, from_agent_id, to_agent_id, note)
    VALUES (
      ${entry.sourceType}, ${entry.sourceId}, ${entry.customerId}, ${entry.eventType}, ${entry.actorId},
      ${entry.fromAgentId ?? null}, ${entry.toAgentId ?? null}, ${entry.note ?? null}
    )
  `
}
