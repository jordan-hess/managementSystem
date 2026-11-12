-- T2 Queue Hub merge — links tickets to the shared `customers` table (the
-- same one support_tickets/callbacks/followups already use), so a customer's
-- full history spans every ticket type in one place, not just T2's own
-- imsi/msisdn/customer_email fields (kept as-is on the ticket for the
-- technical/SIM-level detail — customer_id is the person, those are the
-- line/device). Nullable: T2's originally-migrated tickets predate this
-- link and have no customer on file to attach.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);
