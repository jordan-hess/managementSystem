import { sql } from '@/lib/db/pool'
import { TicketHistoryRecord } from '@/types'

/**
 * Phase 2's full per-customer ticket history — same UNION ALL across the
 * four ticket-like tables as lib/activeAssistance/getActiveAssistance.ts's
 * getActiveAssistanceForCustomer, but without the `status IN (...)` active
 * filters (every ticket regardless of status) and with created_at added, so
 * the unified Tickets page's customer panel can show a customer's whole
 * history, not just what's currently active.
 */
export async function getTicketHistoryForCustomer(
  customerId: string,
  executor: typeof sql = sql,
): Promise<TicketHistoryRecord[]> {
  return executor<TicketHistoryRecord[]>`
    SELECT
      x.source_type AS "sourceType",
      x.source_id AS "sourceId",
      x.ticket_label AS "ticketLabel",
      x.queue_or_channel AS "queueOrChannel",
      x.status,
      x.agent_id AS "agentId",
      p.full_name AS "agentName",
      x.updated_at AS "updatedAt",
      x.created_at AS "createdAt",
      x.customer_id AS "customerId",
      c.name AS "customerName",
      x.issue_type AS "issueType",
      x.root_cause AS "rootCause"
    FROM (
      SELECT
        'support_ticket'::text AS source_type, st.id AS source_id,
        COALESCE(st.reference, initcap(st.channel)) AS ticket_label,
        st.channel AS queue_or_channel, st.status, st.agent_id, st.updated_at, st.created_at, st.customer_id,
        st.issue_type, st.root_cause
      FROM support_tickets st
      WHERE st.customer_id = ${customerId}

      UNION ALL

      SELECT
        'followup', f.id, initcap(f.type), f.type, f.status, f.agent_id, f.updated_at, f.created_at, f.customer_id,
        NULL::text, NULL::text
      FROM followups f
      WHERE f.customer_id = ${customerId}

      UNION ALL

      SELECT
        'callback', cb.id, 'Callback', NULL, cb.status, cb.agent_id, cb.updated_at, cb.created_at, cb.customer_id,
        NULL::text, NULL::text
      FROM callbacks cb
      WHERE cb.customer_id = ${customerId}

      UNION ALL

      SELECT
        't2_ticket', t.id, t.ticket_number, t.queue, t.status, t.assigned_to,
        (COALESCE((SELECT MAX(te.created_at) FROM ticket_events te WHERE te.ticket_id = t.id), t.created_at)::timestamp AT TIME ZONE 'UTC'),
        (t.created_at::timestamp AT TIME ZONE 'UTC'), t.customer_id,
        NULL::text, NULL::text
      FROM tickets t
      WHERE t.customer_id = ${customerId}
    ) x
    LEFT JOIN profiles p ON p.id = x.agent_id
    LEFT JOIN customers c ON c.id = x.customer_id
    ORDER BY x.created_at DESC
  `
}
