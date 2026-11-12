-- Callback-only contact details (spec: docs/superpowers/specs/2026-10-12-callback-contact-details-design.md §3).
-- A callback is EITHER linked to a customer (customer_id set, contact_* all NULL)
-- OR a manual callback (customer_id NULL, at least one non-blank email/phone).
-- contact_* hold personal data of people NOT in customers: erasure = DELETE the
-- callback row (redaction to all-NULL is rejected by callbacks_customer_or_contact).
-- Idempotent; one transaction; existing rows already satisfy every check.
-- Apply: psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f <this file>   (before the build that writes these columns)

BEGIN;

SET LOCAL lock_timeout = '5s';        -- don't queue behind a long reader and stall the table; re-run if it times out
SET LOCAL statement_timeout = '60s';

ALTER TABLE callbacks ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE callbacks
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text;

ALTER TABLE callbacks
  DROP CONSTRAINT IF EXISTS callbacks_contact_email_length,
  DROP CONSTRAINT IF EXISTS callbacks_contact_email_not_blank,
  DROP CONSTRAINT IF EXISTS callbacks_contact_name_length,
  DROP CONSTRAINT IF EXISTS callbacks_contact_name_not_blank,
  DROP CONSTRAINT IF EXISTS callbacks_contact_phone_length,
  DROP CONSTRAINT IF EXISTS callbacks_contact_phone_not_blank,
  DROP CONSTRAINT IF EXISTS callbacks_customer_or_contact,
  ADD CONSTRAINT callbacks_contact_email_length    CHECK (contact_email IS NULL OR char_length(contact_email) <= 254),
  ADD CONSTRAINT callbacks_contact_email_not_blank CHECK (contact_email IS NULL OR contact_email ~ '\S'),
  ADD CONSTRAINT callbacks_contact_name_length     CHECK (contact_name  IS NULL OR char_length(contact_name)  <= 120),
  ADD CONSTRAINT callbacks_contact_name_not_blank  CHECK (contact_name  IS NULL OR contact_name  ~ '\S'),
  ADD CONSTRAINT callbacks_contact_phone_length    CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 40),
  ADD CONSTRAINT callbacks_contact_phone_not_blank CHECK (contact_phone IS NULL OR contact_phone ~ '\S'),
  ADD CONSTRAINT callbacks_customer_or_contact CHECK (
    (customer_id IS NOT NULL AND contact_name IS NULL AND contact_email IS NULL AND contact_phone IS NULL)
    OR
    (customer_id IS NULL AND (coalesce(contact_email, '') ~ '\S' OR coalesce(contact_phone, '') ~ '\S'))
  );

COMMENT ON COLUMN callbacks.contact_name  IS 'Personal data: manual-callback contact (not a customer). NULL when customer_id is set. Retention: TBD.';
COMMENT ON COLUMN callbacks.contact_email IS 'Personal data: manual-callback contact (not a customer). NULL when customer_id is set. Retention: TBD.';
COMMENT ON COLUMN callbacks.contact_phone IS 'Personal data: manual-callback contact (not a customer). NULL when customer_id is set. Retention: TBD.';

COMMIT;
