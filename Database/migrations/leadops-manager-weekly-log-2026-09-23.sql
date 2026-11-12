-- leadOps: the Manager weekly log.
--
-- The leadOps integration plan specifies a small Manager weekly log
-- alongside the Team Leader one (interactions sampled, calibration
-- spot-check attended, TL 1:1s held), but its own schema section never
-- defined a table for it - weekly_manual_log covers the TL side only. This
-- adds the missing counterpart, mirroring weekly_manual_log's shape: one
-- row per manager per week, keyed on the Monday of that week, with counters
-- defaulting to zero so a partially-filled week is still a valid row.
--
-- Deliberately a separate table rather than a role column on
-- weekly_manual_log: the two logs record different fields, and folding them
-- together would mean half the columns are always null for one role.
--
-- Scope note: this is the ONLY leadOps table created so far. The rest of the
-- leadOps schema (shift_templates, shift_template_blocks, tl_shift_days,
-- planner_block_logs, planner_unplanned_entries, weekly_manual_log,
-- efficiency_metric_defs, efficiency_scores, kpa_weights,
-- performance_reviews) is still Phase 1 work and is mirrored in TypeScript
-- under lib/leadops/ against mock data. Note weekly_manual_log itself does
-- not exist yet either, so this table currently stands alone.
--
-- Apply by hand, as with every file in this directory:
--   psql "$DATABASE_URL" -f Database/migrations/leadops-manager-weekly-log-2026-09-23.sql
-- Idempotent - safe to re-run.

CREATE TABLE IF NOT EXISTS manager_weekly_log (
  manager_id              UUID        NOT NULL REFERENCES profiles(id),
  -- The Monday the week commences, matching how the roster buckets weeks.
  week_of                 DATE        NOT NULL,
  interactions_sampled    INTEGER     NOT NULL DEFAULT 0,
  calibration_spot_check  BOOLEAN     NOT NULL DEFAULT FALSE,
  tl_one_on_ones          INTEGER     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (manager_id, week_of),
  CONSTRAINT manager_weekly_log_interactions_sampled_non_negative CHECK (interactions_sampled >= 0),
  CONSTRAINT manager_weekly_log_tl_one_on_ones_non_negative CHECK (tl_one_on_ones >= 0)
);

-- The dominant read is "every manager's row for this week" on the weekly
-- log page; the primary key leads on manager_id, so that filter needs its
-- own index.
CREATE INDEX IF NOT EXISTS manager_weekly_log_week_of_idx ON manager_weekly_log (week_of);

COMMENT ON TABLE manager_weekly_log IS
  'leadOps Manager weekly log - one row per manager per week. The manager-side counterpart to weekly_manual_log, covering the fields with no other source of truth in opsHub.';
