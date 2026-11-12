-- QA overview follow-up — managed query categories and the team leader at
-- review time. Apply AFTER qa-scorecard-rework-2026-10-20.sql (it needs the
-- reworked qa_reviews). Runbook: docs/runbooks/prod-qa-scorecard-2026-10-20.md.
--
-- 1. qa_query_categories: a per-department dropdown list for a review's
--    "Query / Category", managed on the Scorecard settings page. The old
--    free-text qa_reviews.interaction_type stays as the optional detail.
-- 2. qa_reviews.category_id: the picked category.
-- 3. qa_reviews.team_leader_id: the agent's team leader, captured when the
--    review is saved, so the overview groups by who led the agent then, not now.
--
-- Additive and re-runnable (IF NOT EXISTS / ON CONFLICT / WHERE ... IS NULL).
-- Apply by hand with `psql -v ON_ERROR_STOP=1 -f`.

BEGIN;

CREATE TABLE IF NOT EXISTS qa_query_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department  text NOT NULL CHECK (department IN ('Social', 'T2', 'Billing')),
  name        text NOT NULL CHECK (btrim(name) <> ''),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- One spelling per department, case-insensitive ("SIM swap" vs "sim swap").
CREATE UNIQUE INDEX IF NOT EXISTS qa_query_categories_department_name_uq ON qa_query_categories (department, lower(name));

ALTER TABLE qa_reviews
  ADD COLUMN IF NOT EXISTS category_id    uuid REFERENCES qa_query_categories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS team_leader_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS qa_reviews_category_id_idx ON qa_reviews (category_id);
CREATE INDEX IF NOT EXISTS qa_reviews_team_leader_id_idx ON qa_reviews (team_leader_id);

-- Seed: the categories on the team's QA final overview sheet. Edit on the
-- Scorecard settings page afterwards; ON CONFLICT keeps a re-run harmless.
INSERT INTO qa_query_categories (department, name, sort_order) VALUES
  ('Social', 'Network', 1), ('Social', 'Billing', 2), ('Social', 'Cancelation', 3), ('Social', 'Logistics', 4),
  ('Social', 'SIM swap', 5), ('Social', 'Mobile SIM', 6), ('Social', 'Device', 7), ('Social', 'Customer education', 8),
  ('T2', 'Advanced', 1), ('T2', 'SIM swap', 2), ('T2', 'Porting', 3), ('T2', 'Voice', 4),
  ('T2', 'the101', 5), ('T2', 'askbot', 6), ('T2', 'Device', 7),
  ('Billing', 'Credit', 1), ('Billing', 'Refund', 2), ('Billing', 'Policy update', 3), ('Billing', 'WG removal', 4),
  ('Billing', 'Disputes', 5), ('Billing', 'Payment allocation', 6), ('Billing', 'Monthly data allocation', 7),
  ('Billing', 'Buy more data allocation', 8), ('Billing', 'Payment date change', 9), ('Billing', 'Payment transfer', 10),
  ('Billing', 'Speed adjustment', 11), ('Billing', 'Provisioning', 12), ('Billing', 'Account statements', 13),
  ('Billing', 'Itemized billing request', 14)
ON CONFLICT (department, lower(name)) DO NOTHING;

-- Backfill reviews saved before this column existed with the agent's current
-- team leader (the best available; same one-team lookup the app uses).
UPDATE qa_reviews r
SET team_leader_id = (
  SELECT tl.profile_id
  FROM team_members tm
  JOIN team_leaders tl ON tl.team_id = tm.team_id
  WHERE tm.profile_id = r.agent_id
  LIMIT 1
)
WHERE r.team_leader_id IS NULL;

COMMIT;
