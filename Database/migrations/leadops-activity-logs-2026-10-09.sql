-- leadOps Daily & Weekly Activity — real tables, replacing in-memory sample data.
--
--   daily_activity_logs   one row per team leader per day (the Daily Activity form)
--   weekly_manual_logs    one row per team leader per week: ONLY the two genuinely
--                         manual weekly fields. The weekly coaching sessions,
--                         agent-in-seat days and critical fails are always summed
--                         from daily_activity_logs (lib/leadops/rollups.ts), so
--                         they are never stored twice.
--
-- The manager weekly log table (manager_weekly_log) comes from the existing
-- leadops-manager-weekly-log-2026-09-23.sql — apply that file too, unchanged.
--
-- Idempotent and transactional. No seed data. No RLS: authorisation lives in
-- app code (lib/leadops/activityActions.ts), like every leadOps table.
-- Apply on a database BEFORE deploying a build that contains the activity
-- screens (there is no feature flag).

BEGIN;

CREATE TABLE IF NOT EXISTS daily_activity_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tl_id             uuid        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  date              date        NOT NULL,
  calls_listened    integer     NOT NULL DEFAULT 0 CHECK (calls_listened    BETWEEN 0 AND 10000),
  tickets_reviewed  integer     NOT NULL DEFAULT 0 CHECK (tickets_reviewed  BETWEEN 0 AND 10000),
  audits_completed  integer     NOT NULL DEFAULT 0 CHECK (audits_completed  BETWEEN 0 AND 10000),
  critical_fails    integer     NOT NULL DEFAULT 0 CHECK (critical_fails    BETWEEN 0 AND 10000),
  coaching_sessions integer     NOT NULL DEFAULT 0 CHECK (coaching_sessions BETWEEN 0 AND 10000),
  agent_in_seat     boolean     NOT NULL DEFAULT false,
  notes             text        CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tl_id, date)
);

CREATE INDEX IF NOT EXISTS daily_activity_logs_date_idx ON daily_activity_logs (date);

CREATE TABLE IF NOT EXISTS weekly_manual_logs (
  tl_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  -- The Monday the week commences (same bucketing as the roster).
  week_of     date        NOT NULL CHECK (EXTRACT(ISODOW FROM week_of) = 1),
  calibration boolean     NOT NULL DEFAULT false,
  re_audits   integer     NOT NULL DEFAULT 0 CHECK (re_audits BETWEEN 0 AND 10000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tl_id, week_of)
);

COMMIT;
