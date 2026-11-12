-- Part of the T2 Queue Hub merge (see docs/superpowers/plans or the
-- migration plan that drove this work).
--
-- 1. Applies the never-actually-applied add-team-leader-role.sql (profiles
--    role check only had agent/admin/management on this database — verified
--    live, not just from reading the file) so 'team_leader' becomes a legal
--    role value, matching lib/auth/authz.ts's Role type which already
--    assumes it exists.
-- 2. Widens the same constraint further to add 't3' — T2 Queue Hub's
--    escalation-destination-desk role, which has no CMS equivalent.
-- 3. Adds profiles.username (nullable, unique where set) and
--    profiles.t2_team (nullable) so T2's username-login users and their
--    'team' field (e.g. 'CEC.ADVANCED.A', 'Voice', or a T3 team name) can be
--    represented without conflating with profiles.department, which may
--    already carry different values/meaning for existing CMS profiles.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('agent', 'admin', 'management', 'team_leader', 't3'));

-- CREATE OR REPLACE keeps the existing trigger binding
-- (trg_enforce_team_leader_is_admin) intact if it exists — only the
-- allowed-role check inside it changes. No-ops harmlessly if the trigger
-- was never created on this database.
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

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS t2_team text;
