-- Live, self-service agent status (Active / On Break / In a Meeting) — a
-- new, small concept distinct from attendance_status (a team-leader-set
-- whole-day judgment) and agent_login_log (a once-a-day logged-in-yet
-- check). One row per profile, upserted by the agent themselves via the
-- new "My Status" toggle next to MyQueueWidget on /tickets. Read by the
-- Roster grid and Team Management board (via agentStatus/actions.ts's
-- getAllAgentStatusesAction) to override the existing presence dot.
CREATE TABLE IF NOT EXISTS agent_status (
  user_id    uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'break', 'meeting')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
