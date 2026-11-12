-- QA Scorecard rework — replaces the weighted-criteria QA model (qa_criteria,
-- qa_rating_definitions, qa_scores, qa_thresholds) with the 11-item
-- Yes/No + 0-5 scorecard (qa_review_items) and effective-dated global settings
-- (qa_settings). Spec: docs/superpowers/specs/2026-10-20-qa-scorecard-design.md.
-- Runbook: docs/runbooks/prod-qa-scorecard-2026-10-20.md.
--
-- NOT idempotent, by design: it is a one-shot destructive rework. Re-running it
-- after success fails at the first DROP/ADD. It runs as a single transaction, so
-- a failure part-way leaves the database exactly as it was.
--
-- Precondition: the QA review data tables are EMPTY (guard below). Apply by hand
-- with `psql -v ON_ERROR_STOP=1 -f`. No constraint names are hard-coded: dropping
-- a column also drops the CHECK constraints that reference it, and constraint
-- names can differ between databases (see qa-dm-call-combined-schema.sql).

BEGIN;

-- 1. Lock, then guard. The lock stops the running app inserting a row between the
--    guard and the drops (READ COMMITTED would otherwise let it slip through).
LOCK TABLE qa_reviews, qa_scores, qa_audit_log, coaching_actions, qa_review_critical_failures IN ACCESS EXCLUSIVE MODE;

-- Guard: refuse to run if any review data exists.
DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['qa_reviews', 'qa_scores', 'qa_audit_log', 'coaching_actions', 'qa_review_critical_failures']
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'qa scorecard rework: % is not empty', t;
    END IF;
  END LOOP;
END $$;

-- 2. qa_reviews: drop the old columns (also drops their CHECKs, the
--    outcome_band_id -> qa_thresholds FK and the channel/origin index).
ALTER TABLE qa_reviews
  DROP COLUMN IF EXISTS channel,
  DROP COLUMN IF EXISTS origin,
  DROP COLUMN IF EXISTS raw_weighted_percentage,
  DROP COLUMN IF EXISTS final_percentage,
  DROP COLUMN IF EXISTS na_weight_excluded,
  DROP COLUMN IF EXISTS has_critical_failure,
  DROP COLUMN IF EXISTS outcome_forced_fail,
  DROP COLUMN IF EXISTS outcome_band_id,
  DROP COLUMN IF EXISTS outcome_label_snapshot;

-- 3. Drop the old scoring tables (all empty; qa_thresholds goes last, its FK column is already dropped).
DROP TABLE qa_scores, qa_rating_definitions, qa_criteria, qa_thresholds;

-- 4. qa_settings: effective-dated global scoring settings.
CREATE TABLE qa_settings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_mark         numeric(5,2) NOT NULL,
  excellent_from    numeric(5,2) NOT NULL,
  critical_fail_cap numeric(5,2) NOT NULL,
  effective_from    date NOT NULL UNIQUE,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (critical_fail_cap >= 0 AND critical_fail_cap <= 100),
  CHECK (pass_mark > 0 AND pass_mark < excellent_from AND excellent_from <= 100)
);

-- Seed so every interaction date resolves to a settings row.
INSERT INTO qa_settings (pass_mark, excellent_from, critical_fail_cap, effective_from)
VALUES (75, 85, 60, '1900-01-01');

-- 5. qa_reviews: new columns. The table is empty, so NOT NULL without a default is safe.
ALTER TABLE qa_reviews
  ADD COLUMN legs               text NOT NULL CHECK (legs IN ('written', 'call', 'both')),
  ADD COLUMN department         text NOT NULL CHECK (department IN ('Social', 'T2', 'Billing')),
  ADD COLUMN raw_score          numeric(4,1),
  ADD COLUMN final_score        numeric(4,1),
  ADD COLUMN critical_fail      boolean NOT NULL DEFAULT false,
  ADD COLUMN rating_label       text NOT NULL DEFAULT '' CHECK (rating_label IN ('', 'Fail', 'Good', 'Excellent', 'Fail (Critical)')),
  ADD COLUMN closing_line       text CHECK (closing_line IN ('Yes', 'No', 'NA')),
  ADD COLUMN settings_id        uuid NOT NULL REFERENCES qa_settings(id) ON DELETE RESTRICT,
  ADD COLUMN fcr                text CHECK (fcr IN ('yes', 'no', 'na')),
  -- Must be a type whose item_code IS NULL (coaching-only flag); enforced in the app.
  ADD COLUMN root_cause_type_id uuid REFERENCES qa_critical_failure_types(id) ON DELETE RESTRICT,
  ADD COLUMN gap_identified     text,
  ADD COLUMN solution           text;

CREATE INDEX qa_reviews_settings_id_idx ON qa_reviews (settings_id);

-- 6. qa_review_items: one row per scorecard item (replaces qa_scores). All 11 are
--    always written. C and B items take yes/no/na; Q items take '0'..'5'/na.
CREATE TABLE qa_review_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id       uuid NOT NULL REFERENCES qa_reviews(id) ON DELETE CASCADE,
  item_code       text NOT NULL CHECK (item_code IN ('C1', 'C2', 'C3', 'B1', 'B2', 'B3', 'B4', 'Q1', 'Q2', 'Q3', 'Q4')),
  written_value   text,
  call_value      text,
  points_snapshot numeric(4,1) NOT NULL,
  used            numeric(5,2) NOT NULL DEFAULT 0,
  earned          numeric(5,2) NOT NULL DEFAULT 0,
  comments        text,
  evidence        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, item_code),
  CHECK (
    (left(item_code, 1) IN ('C', 'B')
      AND (written_value IS NULL OR written_value IN ('yes', 'no', 'na'))
      AND (call_value    IS NULL OR call_value    IN ('yes', 'no', 'na')))
    OR
    (left(item_code, 1) = 'Q'
      AND (written_value IS NULL OR written_value IN ('0', '1', '2', '3', '4', '5', 'na'))
      AND (call_value    IS NULL OR call_value    IN ('0', '1', '2', '3', '4', '5', 'na')))
  )
);
CREATE INDEX qa_review_items_review_id_idx ON qa_review_items (review_id);

-- 7. qa_critical_failure_types: item_code marks a type as a reason tag for a
--    critical item (C1/C2/C3); NULL = coaching-only flag. The 3 old behaviour
--    columns go (all false/NULL already; the cap is now global in qa_settings).
ALTER TABLE qa_critical_failure_types
  ADD COLUMN item_code text CHECK (item_code IN ('C1', 'C2', 'C3')),
  DROP COLUMN IF EXISTS auto_fail,
  DROP COLUMN IF EXISTS caps_max_score,
  DROP COLUMN IF EXISTS requires_manager_review;

-- Approved mapping (2026-10-20). All other types stay NULL (coaching-only).
-- Rolls the whole migration back unless exactly the 4 expected rows are mapped.
DO $$
DECLARE
  n     integer;
  total integer := 0;
BEGIN
  UPDATE qa_critical_failure_types SET item_code = 'C1'
   WHERE name IN ('Security/authentication failure', 'Privacy violation');
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  UPDATE qa_critical_failure_types SET item_code = 'C2'
   WHERE name IN ('Failure to Follow Up');
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  UPDATE qa_critical_failure_types SET item_code = 'C3'
   WHERE name IN ('Behaviour');
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  IF total <> 4 THEN
    RAISE EXCEPTION 'qa scorecard rework: expected 4 critical-failure types mapped, got %', total;
  END IF;
END $$;

-- 8. qa_review_critical_failures: drop the obsolete snapshots (keep
--    requires_coaching_snapshot); a reason tag no longer needs notes.
ALTER TABLE qa_review_critical_failures
  DROP COLUMN IF EXISTS auto_fail_snapshot,
  DROP COLUMN IF EXISTS caps_max_score_snapshot,
  DROP COLUMN IF EXISTS requires_manager_review_snapshot,
  ALTER COLUMN notes DROP NOT NULL;

COMMIT;
