-- Team leaders (admins with a team_leaders row) could previously only coach,
-- run 1-on-1s, submit/view QA assessments, and issue warnings for their own
-- team's agents. Widens all of these to any admin/management, matching a
-- plain (non-leading) admin's existing unrestricted access — "team leader"
-- no longer narrows who can be assessed/coached/warned. Editing rules that
-- aren't team-scoping (only the original assessor/issuer can edit their own
-- row) are untouched. Idempotent — safe to re-run.

CREATE OR REPLACE FUNCTION coaching_can_manage(p_agent_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    p_agent_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role IN ('management', 'admin'));
$$;