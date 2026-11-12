-- New ticket channels agents receive alongside escalations: Freescout, WhatsApp,
-- HelloPeter. Kept as their own table (not folded into followups) since these
-- originate from external platforms and carry a reference/ticket number those
-- don't. Structure and RLS deliberately mirror followups' own shape/policies.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS support_tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  agent_id          uuid NOT NULL REFERENCES profiles(id),
  created_by        uuid NOT NULL REFERENCES profiles(id),
  channel           text NOT NULL CHECK (channel IN ('freescout', 'whatsapp', 'hellopeter')),
  reference         text,
  query_description text NOT NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority          text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date          timestamptz,
  resolution_notes  text,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_agent_id    ON support_tickets (agent_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON support_tickets (customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_channel     ON support_tickets (channel);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status      ON support_tickets (status);