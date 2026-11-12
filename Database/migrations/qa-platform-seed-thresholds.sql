-- Holistic QA Platform (Phase 1) — seeds the initial 4 outcome bands with
-- inclusive lower bounds (Fail 0-74.99, Good 75-84.99, Very Good 85-89.99,
-- Excellent 90-100), effective from the date this migration is applied.
-- Idempotent (guarded by name, since there's no natural unique key on
-- name/effective_from alone that should be enforced long-term — future
-- threshold revisions will reuse names with new effective_from dates).

INSERT INTO qa_thresholds (name, min_score, max_score, effective_from, active, sort_order)
SELECT v.name, v.min_score, v.max_score, CURRENT_DATE, true, v.sort_order
FROM (VALUES
  ('Fail', 0, 74.99, 1),
  ('Good', 75, 84.99, 2),
  ('Very Good', 85, 89.99, 3),
  ('Excellent', 90, 100, 4)
) AS v(name, min_score, max_score, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM qa_thresholds WHERE active = true);
