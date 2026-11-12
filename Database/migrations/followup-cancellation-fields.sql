-- Adds a "Cancellations" case category plus the two extra fields it needs on
-- follow-ups: cancellation_reason (required in the UI when the category is
-- Cancellations) and collection_address (always optional). Both columns stay
-- nullable at the DB level — the required/optional split is a form-level
-- concern (which category is selected), not something a CHECK constraint
-- can express cleanly against a category name that's user-editable.
-- Idempotent — safe to re-run.

ALTER TABLE followups ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE followups ADD COLUMN IF NOT EXISTS collection_address text;

INSERT INTO case_categories (name, is_active)
VALUES ('Cancellations', true)
ON CONFLICT ((lower(name))) DO NOTHING;
