-- Product decision: critical failures no longer force a fail (or cap the
-- score) - flagging one now only ever suggests a coaching session
-- (requires_coaching), same as every other coaching-opportunity rule in
-- lib/qa/coachingOpportunities.ts. resolveCriticalFailures()
-- (lib/qa/criticalFailures.ts) already treats auto_fail=false and
-- caps_max_score=NULL as "no consequence beyond the flag itself" - no
-- application code changes were needed for that half of this change.
--
-- Also replaces the 6 provisional SIT-seed types from
-- qa-platform-seed-critical-failure-types.sql (itself explicitly marked
-- "NOT final business rules") with an 11-category list. Three of the six
-- had a confident enough match to rename in place - preserving their id,
-- and therefore any history already logged against them via
-- qa_review_critical_failures.critical_failure_type_id, which is
-- ON DELETE RESTRICT and would block a delete+recreate:
--   Failure to follow mandatory process -> Process Non-Compliance
--   Compliance breach                   -> System / Business Rule
--   Incorrect customer information      -> Knowledge Gap
-- The other three (Security/authentication failure, Privacy violation,
-- Incorrect technical action) didn't have a confident match in the new
-- list, so they're kept as their own rows - just with the same
-- auto_fail/cap/coaching reset applied below - rather than force-fit into
-- one of the 11. The business should revisit whether these still need to
-- exist alongside the new list.

BEGIN;

-- 1. Rename the 3 confident matches.
UPDATE qa_critical_failure_types SET
  name = 'Process Non-Compliance',
  description = 'A required step in the standard process was skipped or done out of order.',
  sort_order = 1
WHERE name = 'Failure to follow mandatory process';

UPDATE qa_critical_failure_types SET
  name = 'System / Business Rule',
  description = 'A system limitation, or a mandatory business/regulatory/contractual rule, was not followed or accounted for.',
  sort_order = 11
WHERE name = 'Compliance breach';

UPDATE qa_critical_failure_types SET
  name = 'Knowledge Gap',
  description = 'The agent did not know, or incorrectly applied, the correct product, process, or account information.',
  sort_order = 6
WHERE name = 'Incorrect customer information';

-- 2. Insert the remaining 8 categories that had no existing match.
INSERT INTO qa_critical_failure_types (name, description, auto_fail, caps_max_score, requires_manager_review, requires_coaching, sort_order) VALUES
  ('Lack of Investigation', 'The agent did not properly investigate the customer''s account or issue before acting or responding.', false, NULL, false, true, 2),
  ('Failure to Resolve / Ownership', 'The agent did not take ownership of the query through to resolution.', false, NULL, false, true, 3),
  ('Missed FCR Opportunity', 'The query could reasonably have been resolved on first contact but was not.', false, NULL, false, true, 4),
  ('Failure to Follow Up', 'A promised or required follow-up with the customer did not happen.', false, NULL, false, true, 5),
  ('Communication', 'Unclear, unprofessional, or otherwise poor communication with the customer.', false, NULL, false, true, 7),
  ('Behaviour', 'Conduct toward the customer, or in handling the interaction, fell short of expectations.', false, NULL, false, true, 8),
  ('Documentation Gap', 'The interaction, case, or account was not documented as required.', false, NULL, false, true, 9),
  ('Escalation Failure', 'An issue that should have been escalated was not, or was escalated incorrectly.', false, NULL, false, true, 10)
ON CONFLICT (name) DO NOTHING;

-- 3. Push the 3 unmatched legacy rows to display after the new 11, so
-- they read as "kept, pending business review" rather than interleaved.
UPDATE qa_critical_failure_types SET sort_order = 12 WHERE name = 'Security/authentication failure';
UPDATE qa_critical_failure_types SET sort_order = 13 WHERE name = 'Privacy violation';
UPDATE qa_critical_failure_types SET sort_order = 14 WHERE name = 'Incorrect technical action';

-- 4. Strip auto-fail/score-cap from EVERY critical failure type, old and
-- new alike - flagging one is now always just a coaching suggestion,
-- never an automatic consequence.
UPDATE qa_critical_failure_types SET
  auto_fail = false,
  caps_max_score = NULL,
  requires_manager_review = false,
  requires_coaching = true;

COMMIT;
