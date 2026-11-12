-- Billing queue schema — two new ticket fields: payment channel and amount.
-- Captures which payment channel (Stitch, Peach Payments, Pay@, Receivables)
-- and transaction amount (for Refund and Wallet Adjustment reasons).
-- Idempotent — safe to re-run.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2);
