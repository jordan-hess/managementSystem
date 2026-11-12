-- Widen tickets_status_check to permit 'follow_up' — the Billing status
-- flow (BillingStatusModal.tsx / updateBillingTicketStatusAction) moves a
-- ticket to Follow Up or Resolved, and 'follow_up' wasn't part of the
-- original T2 status set this constraint was written for.
-- Idempotent — safe to re-run.

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY['open', 'in_progress', 'escalated', 'awaiting_t3', 't3_responded', 'resolved', 'closed', 'callback', 'follow_up']));
