-- Customer Active Assistance (Phase 1) — shared audit trail.
--
-- Not a FK-normalized "one parent table" log: source_id deliberately has no
-- foreign key, since it points at one of four different tables
-- (support_tickets/followups/callbacks/tickets) depending on source_type.
-- Integrity is enforced in app code only, matching this app's existing
-- no-RLS/no-trigger model (see lib/db/tx.ts's header comment).
--
-- Scope for this phase: only the new code the active-assistance feature
-- introduces writes here (creation-with-duplicate-check, ownership
-- transfer/claim). Retrofitting audit logging onto the ~20 pre-existing
-- status/assignment mutations across support-tickets/actions.ts and
-- t2/actions.ts is deliberately out of scope — see the design doc.
CREATE TABLE IF NOT EXISTS ticket_activity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type   text NOT NULL CHECK (source_type IN ('support_ticket', 'followup', 'callback', 't2_ticket')),
  source_id     uuid NOT NULL,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  event_type    text NOT NULL CHECK (event_type IN ('created', 'ownership_transferred', 'duplicate_warning_overridden')),
  actor_id      uuid REFERENCES profiles(id),
  from_agent_id uuid REFERENCES profiles(id),
  to_agent_id   uuid REFERENCES profiles(id),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_activity_log_customer ON ticket_activity_log (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_log_source ON ticket_activity_log (source_type, source_id, created_at DESC);

-- followups.customer_id and callbacks.customer_id had no index before this
-- feature — the live active-assistance check queries all four ticket-like
-- tables by customer_id on every call, so these two are load-bearing for
-- keeping that query fast (support_tickets and tickets already had one:
-- idx_support_tickets_customer_id, idx_tickets_customer).
CREATE INDEX IF NOT EXISTS idx_followups_customer_id ON followups (customer_id);
CREATE INDEX IF NOT EXISTS idx_callbacks_customer_id ON callbacks (customer_id);
