import { sql } from '@/lib/db/pool'
import { ActiveAssistanceRecord } from '@/types'

/**
 * Customer Active Assistance's central, reusable check: "is anyone already
 * assisting this customer right now, and if so who/where/what status."
 *
 * A live UNION ALL across the four ticket-like tables (all already FK'd to
 * the same customers(id)) — deliberately NOT a synced/materialized cache
 * table. There are 20+ existing write paths across support-tickets/actions.ts
 * and t2/actions.ts that touch status/agent columns on these tables, and
 * this app has no RLS/triggers to catch a write path that forgets to
 * maintain a cache. A live query can't drift by construction; the read cost
 * (four small indexed scans) is negligible against how often these tables
 * are written.
 *
 * Status -> "active" mapping (confirmed with product): an `open` ticket
 * counts as active, not just `in_progress` — support_tickets.agent_id and
 * followups.agent_id are NOT NULL, so an `open` row already has an owner,
 * and treating it as active is what actually prevents duplicate work from
 * the moment a ticket exists.
 *
 * T2's tickets table stores its own timestamps as UTC-naive TEXT
 * ('YYYY-MM-DD HH:MI:SS', a SQLite-port legacy — see lib/t2/sla.ts) rather
 * than timestamptz. `updated_at` here is derived from the most recent
 * ticket_events row (falling back to created_at), cast as UTC to line up
 * with the other three tables' native timestamptz columns.
 *
 * Pass `executor` (a transaction, cast `tx as unknown as typeof sql` per
 * the existing convention in app/(app)/t2/actions.ts) to read inside an
 * open transaction — used by createWithDuplicateCheck's in-lock recheck.
 */
export async function getActiveAssistanceForCustomer(
  customerId: string,
  executor: typeof sql = sql,
): Promise<ActiveAssistanceRecord[]> {
  return executor<ActiveAssistanceRecord[]>`
    SELECT
      x.source_type AS "sourceType",
      x.source_id AS "sourceId",
      x.ticket_label AS "ticketLabel",
      x.queue_or_channel AS "queueOrChannel",
      x.status,
      x.agent_id AS "agentId",
      p.full_name AS "agentName",
      x.updated_at AS "updatedAt"
    FROM (
      SELECT
        'support_ticket'::text AS source_type, st.id AS source_id,
        COALESCE(st.reference, initcap(st.channel)) AS ticket_label,
        st.channel AS queue_or_channel, st.status, st.agent_id, st.updated_at
      FROM support_tickets st
      WHERE st.customer_id = ${customerId} AND st.status IN ('open', 'in_progress')

      UNION ALL

      SELECT
        'followup', f.id, initcap(f.type), f.type, f.status, f.agent_id, f.updated_at
      FROM followups f
      WHERE f.customer_id = ${customerId} AND f.status IN ('open', 'in_progress')

      UNION ALL

      SELECT
        'callback', cb.id, 'Callback', NULL, cb.status, cb.agent_id, cb.updated_at
      FROM callbacks cb
      WHERE cb.customer_id = ${customerId} AND cb.status IN ('pending', 'rescheduled')

      UNION ALL

      SELECT
        't2_ticket', t.id, t.ticket_number, t.queue, t.status, t.assigned_to,
        (COALESCE((SELECT MAX(te.created_at) FROM ticket_events te WHERE te.ticket_id = t.id), t.created_at)::timestamp AT TIME ZONE 'UTC')
      FROM tickets t
      WHERE t.customer_id = ${customerId}
        AND t.status IN ('open', 'in_progress', 'escalated', 'awaiting_t3', 't3_responded')
    ) x
    LEFT JOIN profiles p ON p.id = x.agent_id
    ORDER BY x.updated_at DESC
  `
}
