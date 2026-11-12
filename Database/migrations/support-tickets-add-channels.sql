-- Phase 2 (unified Tickets page) — add MyBroadband and PissedCustomer as
-- Social channels, per the original spec's queue list which named both but
-- the schema never had them.
ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_channel_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_channel_check
  CHECK (channel IN ('freescout', 'whatsapp', 'hellopeter', 'mybroadband', 'pissedcustomer'));
