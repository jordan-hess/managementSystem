-- ============================================================
-- Coaching Check-ins Schema
-- Run this in the Supabase SQL Editor after team-leaders-schema.sql
-- Safe to run on a live database — all changes are additive.
-- ============================================================

-- Has this AGENT's 1-on-1 with their team leader been done, for a given
-- month? Attribution to "which leader's card" is resolved at query time
-- via team_members -> team_leaders, not stored here.
CREATE TABLE coaching_agent_checkins (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_month  date        NOT NULL CHECK (period_month = date_trunc('month', period_month)::date),
  done          boolean     NOT NULL DEFAULT false,
  completed_at  timestamptz,
  marked_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, period_month)
);
CREATE INDEX idx_coaching_agent_checkins_period ON coaching_agent_checkins (period_month);
CREATE TRIGGER trg_coaching_agent_checkins_updated_at
  BEFORE UPDATE ON coaching_agent_checkins FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Has MANAGEMENT personally done their check-in with this TEAM LEADER,
-- for a given month? One row per leader per period regardless of how
-- many teams that leader leads.
CREATE TABLE coaching_leader_checkins (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_month  date        NOT NULL CHECK (period_month = date_trunc('month', period_month)::date),
  done          boolean     NOT NULL DEFAULT false,
  completed_at  timestamptz,
  marked_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, period_month)
);
CREATE INDEX idx_coaching_leader_checkins_period ON coaching_leader_checkins (period_month);
CREATE TRIGGER trg_coaching_leader_checkins_updated_at
  BEFORE UPDATE ON coaching_leader_checkins FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- No DELETE policy on either table — rows are toggled via upsert (boolean
-- flip), never removed.
