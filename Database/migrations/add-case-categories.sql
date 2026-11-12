-- Case categories for the future Volumes page (billing, network, sales, etc.).
-- Run this once in the Supabase SQL Editor. Safe to run on a live database —
-- all changes are additive. Idempotent: safe to re-run if it partially failed
-- or was accidentally run twice.

CREATE TABLE IF NOT EXISTS case_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_by uuid        REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness — "Billing" and "billing" are the same category.
CREATE UNIQUE INDEX IF NOT EXISTS case_categories_name_lower_idx ON case_categories (lower(name));

-- No DELETE policy — deactivate via is_active instead, matching the project's
-- existing convention for tables other data references (see CLAUDE.md).

INSERT INTO case_categories (name) VALUES
  ('Billing'),
  ('Network'),
  ('Sales'),
  ('Service'),
  ('SIM Swap'),
  ('Voice')
ON CONFLICT (lower(name)) DO NOTHING;

-- Nullable: existing followups have no category, and are not backfilled into
-- a synthetic bucket. New cases are required to set one at the application
-- layer (the create form), not by a DB constraint — see
-- docs/superpowers/specs/2026-08-13-case-categories-design.md for why a
-- NOT NULL/CHECK constraint here would be the wrong tool.
ALTER TABLE followups
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES case_categories(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_followups_category_id ON followups (category_id);