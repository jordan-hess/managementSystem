-- Management Reporting Dashboard — every new report query filters on
-- created_at (date range), neither table has it indexed today.
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets (created_at);
