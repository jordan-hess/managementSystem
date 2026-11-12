-- leadOps Manager Scorecard — real tables, replacing mock data.
--
-- Moves the Manager Scorecard scope (and the TL KPI actuals it rolls up
-- from) off lib/leadops/mockData.ts and onto real Postgres tables:
--   efficiency_scores        TL KPI actuals (self/verified), per month
--   manager_monthly_reviews  one per manager per month, with a frozen
--                            snapshot once locked
--   manager_kpa_ratings      the 5 Rated Manager KPAs' self/reviewer ratings
--   tl_team_sizes            the agent headcount the department roll-up
--                            weights by
--
-- Deliberately NOT moved to a real table: KPA/KPI config
-- (lib/leadops/constants.ts's EFFICIENCY_METRIC_DEFS / MANAGER_KPAS). That's
-- config nobody edits at runtime, same reasoning as every other *_METRIC_DEFS
-- style constant in this codebase — see docs/manager-scorecard.md.
--
-- Also NOT moved: Daily/Weekly Activity, Time & Motion, the Planner and TL
-- Performance Reviews — still Phase 0 mock data, out of scope for this
-- change (see docs/manager-scorecard.md's "Real-data migration" section).
--
-- No RLS — this app enforces authorization in app code
-- (lib/leadops/permissions.ts), same as every other opsHub table.
-- Idempotent — safe to re-run. Apply by hand:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f Database/migrations/leadops-manager-scorecard-real-tables-2026-10-01.sql

BEGIN;

CREATE TABLE IF NOT EXISTS efficiency_scores (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tl_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  period             date NOT NULL, -- the 1st of the month being scored
  metric_key         text NOT NULL, -- EfficiencyMetricDef.key (lib/leadops/constants.ts), e.g. 'team_sla_adherence'
  self_value         numeric(8,2),
  is_na              boolean NOT NULL DEFAULT false,
  na_reason          text,
  verified_value     numeric(8,2),
  status             text NOT NULL DEFAULT 'self_reported' CHECK (status IN ('self_reported', 'verified', 'disputed')),
  verified_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at        timestamptz,
  verification_note  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tl_id, period, metric_key),
  CHECK (NOT is_na OR na_reason IS NOT NULL),
  CHECK (status != 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS efficiency_scores_tl_period_idx ON efficiency_scores (tl_id, period);
COMMENT ON TABLE efficiency_scores IS
  'leadOps TL Efficiency Scorecard — one row per team leader per month per KPI. Mirrors lib/leadops/types.ts''s EfficiencyScore.';

CREATE TABLE IF NOT EXISTS manager_monthly_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  month            date NOT NULL,
  reviewer_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'self_submitted', 'reviewed', 'locked')),
  -- A frozen copy of that month's ManagerScorecardSnapshot (lib/leadops/types.ts),
  -- set once on lock and never re-derived afterward — see
  -- lib/leadops/managerScoring.ts's overallAndPillars. History must not
  -- silently change if efficiency_scores/ratings are edited after a lock.
  locked_snapshot  jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manager_id, month),
  CHECK (status != 'locked' OR locked_snapshot IS NOT NULL)
);
COMMENT ON TABLE manager_monthly_reviews IS
  'leadOps Manager Scorecard — one review per manager per month, with a frozen snapshot once locked.';

CREATE TABLE IF NOT EXISTS manager_kpa_ratings (
  manager_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  month              date NOT NULL,
  kpa_key            text NOT NULL, -- ManagerKpa.key (lib/leadops/constants.ts's MANAGER_KPAS), e.g. 'tl_people_leadership'
  -- '1'|'2'|'3'|'NA' as text rather than a nullable smallint + separate
  -- is_na boolean: RatingValue (lib/leadops/types.ts) is a single union
  -- field, not a value-plus-exclusion-flag pair the way EfficiencyScore's
  -- self_value/is_na is — this keeps the DB shape matching the TS shape.
  self_rating        text CHECK (self_rating IN ('1', '2', '3', 'NA')),
  self_evidence      text,
  -- Wins over self_rating when set — including an explicit 'NA', which
  -- still wins over a self rating of '3'. See ratedKpaScorePct.
  reviewer_rating    text CHECK (reviewer_rating IN ('1', '2', '3', 'NA')),
  reviewer_comments  text,
  agreed_action      text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (manager_id, month, kpa_key)
);
COMMENT ON TABLE manager_kpa_ratings IS
  'leadOps Manager Scorecard — the 5 Rated KPAs'' self/reviewer ratings, one row per manager per month per KPA.';

CREATE TABLE IF NOT EXISTS tl_team_sizes (
  tl_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  month        date NOT NULL,
  agent_count  integer NOT NULL CHECK (agent_count >= 0),
  -- False for a row carried forward from the prior month by
  -- resolveTeamSizeForMonth rather than explicitly saved for THIS month —
  -- see lib/leadops/managerScoring.ts. Real saved rows are always true;
  -- the carry-forward case never gets persisted as its own row.
  confirmed    boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tl_id, month)
);
COMMENT ON TABLE tl_team_sizes IS
  'leadOps Manager Scorecard — the agent headcount per team leader per month that the department roll-up weights by. Not derivable from team_members (no history) — see docs/manager-scorecard.md.';

COMMIT;
