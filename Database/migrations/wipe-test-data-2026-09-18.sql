-- One-time wipe of test/testing-history data, at the user's explicit
-- request, ahead of go-live. RUN verify-before-wipe-test-data-2026-09-18.sql
-- FIRST AND REVIEW ITS OUTPUT, and take a backup, before running this
-- file. Claude has no database access and cannot run either file or see
-- real row counts. Not idempotent, not meant to be re-run.
--
-- TRUNCATE ... CASCADE is used rather than a manually-ordered DELETE
-- chain (contrast purge-deactivated-profiles-2026-09-17.sql, which had to
-- preserve data belonging to still-active/valuable entities and so
-- couldn't just cascade-wipe everything touched): every table below, and
-- everything CASCADE pulls in transitively, is disposable test data with
-- nothing worth preserving. CASCADE here means "also empty any table
-- with a foreign key into one of these" - it is not affected by whether
-- that FK's own ON DELETE clause says CASCADE, RESTRICT, or nothing;
-- TRUNCATE's CASCADE option is a separate mechanism from DELETE's.
--
-- Confirmed NOT touched: teams, team_members, team_leaders,
-- shift_templates, team_rotations, roster_overrides (the roster
-- structure - left exactly as is, per explicit instruction), profiles
-- (accounts), qa_criteria/qa_rating_definitions/qa_thresholds/
-- qa_critical_failure_types/case_categories (config/reference data, not
-- test instances). None of these are referenced BY any table in the list
-- below (only the reverse), so CASCADE cannot reach them.
--
-- attendance_records is the one exception carved out of "leave the
-- roster alone" - explicitly included per instruction to clear marked
-- attendance while leaving the rest of the roster untouched.

BEGIN;

TRUNCATE TABLE
  customers,
  tickets,
  followups,
  callbacks,
  support_tickets,
  management_posts,
  notifications,
  password_reset_requests,
  agent_kudos,
  requests,
  qa_reviews,
  coaching_actions,
  warnings,
  attendance_records
CASCADE;

COMMIT;
