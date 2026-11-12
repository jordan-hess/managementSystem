-- Tracks each agent's first login of the business day, so managers/team
-- leaders can see who's logged in yet today and compare it against their
-- scheduled shift start (resolved separately via the roster's existing
-- shift-resolution logic). Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS agent_login_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  login_date     date        NOT NULL,
  first_login_at timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, login_date)
);

CREATE INDEX IF NOT EXISTS idx_agent_login_log_login_date ON agent_login_log (login_date);