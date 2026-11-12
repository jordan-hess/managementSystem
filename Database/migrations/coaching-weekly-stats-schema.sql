-- supabase/migrations/coaching-weekly-stats-schema.sql
-- The only *stored* weekly stat — follow-up/callback/support-ticket counts
-- for the week are computed live from existing tables (see
-- lib/coaching/weeklyStats.ts), matching this app's established
-- fetch-once-derive-client-side convention. Sprinkler has no integration
-- into this app at all, so its count has nowhere else to come from.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS coaching_weekly_stats (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id               uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start_date        date        NOT NULL,
  sprinkler_ticket_count integer     NOT NULL DEFAULT 0 CHECK (sprinkler_ticket_count >= 0),
  entered_by             uuid        NOT NULL REFERENCES profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, week_start_date)
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_coaching_weekly_stats_updated_at ON coaching_weekly_stats;
CREATE TRIGGER trg_coaching_weekly_stats_updated_at
  BEFORE UPDATE ON coaching_weekly_stats FOR EACH ROW EXECUTE FUNCTION set_updated_at();