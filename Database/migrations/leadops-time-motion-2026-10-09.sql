-- leadOps Time & Motion — real tables, replacing in-memory sample data.
-- Spec: docs/superpowers/specs/2026-10-09-leadops-time-motion-design.md
--
--   planner_days              one row per team leader per day that has been saved; carries the
--                             REVISION used to refuse stale saves
--   planner_block_logs        one row per block the team leader marked (no row = still "planned")
--   planner_unplanned_entries unplanned work for the day
--   planner_correction_log    audit trail for the owner-run correction procedure (runbook). The
--                             application never reads or writes it.
--
-- Shift templates stay in code (lib/leadops/constants.ts); block ids are checked by the server.
-- Idempotent and transactional (idempotent is NOT the same as reversible: undoing it means
-- dropping tables, which destroys recorded data — see the runbook). No seed data. No RLS:
-- authorisation lives in app code (lib/leadops/plannerActions.ts). Apply on a database BEFORE
-- deploying a build that contains the Time & Motion screens (there is no feature flag).

BEGIN;

CREATE TABLE IF NOT EXISTS planner_days (
  tl_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  revision   integer     NOT NULL CHECK (revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tl_id, date)
);

CREATE TABLE IF NOT EXISTS planner_block_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tl_id             uuid        NOT NULL,
  date              date        NOT NULL,
  template_block_id text        NOT NULL,
  status            text        NOT NULL CHECK (status IN ('completed', 'moved', 'not_completed')),
  actual_minutes    integer,
  actual_category   text        CHECK (actual_category IS NULL OR actual_category IN
                      ('operations', 'coaching', 'qa', 'team_management', 'admin', 'break', 'escalations')),
  actual_activity   text        CHECK (actual_activity IS NULL OR char_length(actual_activity) <= 200),
  reason            text        CHECK (reason IS NULL OR char_length(reason) <= 1000),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tl_id, date) REFERENCES planner_days (tl_id, date) ON DELETE CASCADE,
  UNIQUE (tl_id, date, template_block_id),
  -- Field rules per status (spec section 1). The server and the form enforce the same rules.
  CONSTRAINT planner_block_logs_status_fields CHECK (
    (status = 'not_completed'
       AND actual_minutes IS NULL AND actual_category IS NULL AND actual_activity IS NULL
       AND reason IS NOT NULL AND btrim(reason) <> '')
    OR (status = 'completed'
       AND actual_minutes IS NOT NULL AND actual_minutes BETWEEN 1 AND 1440 AND actual_category IS NOT NULL)
    OR (status = 'moved'
       AND actual_minutes IS NOT NULL AND actual_minutes BETWEEN 1 AND 1440 AND actual_category IS NOT NULL
       AND reason IS NOT NULL AND btrim(reason) <> '')
  )
);

CREATE TABLE IF NOT EXISTS planner_unplanned_entries (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tl_id              uuid        NOT NULL,
  date               date        NOT NULL,
  category           text        NOT NULL CHECK (category IN
                       ('operations', 'coaching', 'qa', 'team_management', 'admin', 'break', 'escalations')),
  minutes            integer     NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
  reason             text        NOT NULL CHECK (btrim(reason) <> '' AND char_length(reason) <= 1000),
  displaced_block_id text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tl_id, date) REFERENCES planner_days (tl_id, date) ON DELETE CASCADE
);

-- planner_block_logs is already indexed on (tl_id, date, template_block_id) by its UNIQUE constraint.
CREATE INDEX IF NOT EXISTS planner_unplanned_entries_day_idx ON planner_unplanned_entries (tl_id, date);

-- Audit trail for the owner-run correction procedure. No foreign keys on purpose: deleting a
-- profile or a planner day must never remove or alter an audit row.
CREATE TABLE IF NOT EXISTS planner_correction_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by      text        NOT NULL CHECK (btrim(performed_by) <> ''),
  performed_by_role text        NOT NULL DEFAULT current_user,
  tl_id             uuid        NOT NULL,
  planner_date      date        NOT NULL,
  reason            text        NOT NULL CHECK (btrim(reason) <> ''),
  before_state      jsonb       NOT NULL,
  after_state       jsonb       NOT NULL,
  change_ticket     text,
  performed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION planner_correction_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'planner_correction_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS planner_correction_log_no_change ON planner_correction_log;
CREATE TRIGGER planner_correction_log_no_change
  BEFORE UPDATE OR DELETE ON planner_correction_log
  FOR EACH ROW EXECUTE PROCEDURE planner_correction_log_append_only();

DROP TRIGGER IF EXISTS planner_correction_log_no_truncate ON planner_correction_log;
CREATE TRIGGER planner_correction_log_no_truncate
  BEFORE TRUNCATE ON planner_correction_log
  FOR EACH STATEMENT EXECUTE PROCEDURE planner_correction_log_append_only();

REVOKE ALL ON planner_correction_log FROM PUBLIC;

COMMIT;
