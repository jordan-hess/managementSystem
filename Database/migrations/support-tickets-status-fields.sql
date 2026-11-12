-- Social ticket status control: adds escalated/follow_up/callback statuses
-- to support_tickets, the metadata each one needs, and an audit trail for
-- status changes (mirrors followup_status_history's shape exactly). Purely
-- additive — 'open'/'closed' stay valid at the DB level for existing rows
-- even though the status control itself no longer offers 'closed' (there
-- was previously no other way to close a ticket in the unified Tickets UI,
-- but per product decision this control now only exposes forward-moving
-- statuses; 'closed' rows already in the table remain valid history).

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'escalated', 'follow_up', 'callback'));

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS escalation_destination text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS escalation_notes text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS followup_notes text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS followup_scheduled_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS callback_notes text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS callback_scheduled_at timestamptz;

CREATE TABLE IF NOT EXISTS support_ticket_status_history (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  support_ticket_id uuid        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  changed_by        uuid        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  from_status       text        NOT NULL,
  to_status         text        NOT NULL,
  changed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_status_history_ticket_id ON support_ticket_status_history (support_ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_status_history_changed_by ON support_ticket_status_history (changed_by);
CREATE INDEX IF NOT EXISTS idx_support_ticket_status_history_changed_at ON support_ticket_status_history (changed_at);
