-- T2 Queue Hub merge — queue-specific ticket creation fields.
--
-- The ticket creation form now varies by queue (Advanced vs SIM SWAP have
-- entirely different field sets). Rather than a JSONB catch-all, these stay
-- as plain nullable columns matching every other T2 table's convention —
-- each one is only ever populated for SIM SWAP tickets, null otherwise.
-- station_ticket_number is deliberately its own column, not reusing
-- ticket_escalations.station_reference_ticket — that one is per-escalation
-- (captured when escalating to T3), this one is per-ticket, captured at
-- SIM SWAP creation time, and the two tables/lifecycles are unrelated.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sim_type text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS swap_reason text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS swap_requested_date text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS swap_processed text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sim_swap_outcome text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS station_ticket_number text;
