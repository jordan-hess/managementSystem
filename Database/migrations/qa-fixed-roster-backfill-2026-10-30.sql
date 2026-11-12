-- Re-runs qa-fixed-roster-2026-10.sql's backfill for QA analysts created
-- after it was applied (e.g. Charnelle Cupido on PROD): create-user never set
-- a personal rotation pattern, so they had no schedule and were missing from
-- the roster's QA Team grid. create-user now assigns pattern 'J' itself.
-- Idempotent - only touches active QA analysts that have no pattern yet.

UPDATE profiles
SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'J')
WHERE role = 'qa_analyst'
  AND is_active = true
  AND rotation_pattern_id IS NULL
  AND EXISTS (SELECT 1 FROM roster_rotation_patterns WHERE code = 'J');
