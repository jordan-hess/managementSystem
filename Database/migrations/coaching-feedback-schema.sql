-- supabase/migrations/coaching-feedback-schema.sql
-- Coaching feedback: free-text entries about an agent's coaching, authored
-- either by their team leader (or management/admin stepping in) or by the
-- agent themselves (self-reflection). Immutable log — no UPDATE/DELETE
-- policy, matching this app's other log-style tables (e.g. notifications).
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS coaching_feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  author_role text        NOT NULL CHECK (author_role IN ('team_leader', 'agent')),
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_feedback_agent_id ON coaching_feedback (agent_id);

-- Reusable "can the current user manage/view this agent's coaching data"
-- check — mirrors qa_can_view_assessment's exact role logic (management
-- global, admin-team-leader scoped to own team, admin-non-leader broad,
-- self), parameterized directly by agent_id since both new coaching
-- tables key on it directly (no per-row indirection needed here).
CREATE OR REPLACE FUNCTION coaching_can_manage(p_agent_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    p_agent_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'management')
    OR (
      EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
      AND is_submitter_team_leader((select auth.uid()))
      AND EXISTS (
        SELECT 1 FROM team_members tm JOIN team_leaders tl ON tl.team_id = tm.team_id
        WHERE tl.profile_id = (select auth.uid()) AND tm.profile_id = p_agent_id
      )
    )
    OR (
      EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
      AND NOT is_submitter_team_leader((select auth.uid()))
    );
$$;