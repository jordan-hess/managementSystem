-- Adds the 'team_leader' role to profiles.role, alongside existing
-- 'agent', 'admin', 'management'. Run this once in the Supabase SQL Editor.
--
-- Purely additive: no existing profile is changed to this role by this
-- migration. The 4 current team_leaders rows stay role='admin' until a
-- deliberate follow-up migration, once team_leader-specific pages exist to
-- replace the admin-only access they'd otherwise lose (see
-- docs/v2-rbac-and-module-spec.md).
--
-- Row-scoped "is this person a team leader for team X" access already works
-- today via the team_leaders table + is_team_leader_for(team_id) (see
-- requests-schema.sql), independent of profiles.role. This migration only
-- makes 'team_leader' a legal role value and lets a team_leaders row be
-- owned by either an admin or a team_leader profile going forward.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('agent', 'admin', 'management', 'team_leader'));

-- CREATE OR REPLACE keeps the existing trigger binding (trg_enforce_team_leader_is_admin)
-- intact — only the allowed-role check inside it changes.
CREATE OR REPLACE FUNCTION enforce_team_leader_is_admin()
RETURNS TRIGGER AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = NEW.profile_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'enforce_team_leader_is_admin: profile % does not exist', NEW.profile_id;
  END IF;

  IF v_role NOT IN ('admin', 'team_leader') THEN
    RAISE EXCEPTION 'enforce_team_leader_is_admin: profile % has role %, must be admin or team_leader', NEW.profile_id, v_role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
