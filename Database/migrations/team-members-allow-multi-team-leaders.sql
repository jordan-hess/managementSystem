-- Team leaders/admins can now belong to more than one team at once (their
-- own dedicated roster is a future feature; for now they simply shouldn't
-- be pinned to a single team_members row the way an agent is). Widens the
-- old "one active team per profile" constraint to "one row per (team,
-- profile) pair" — a plain agent still gets at most one row in practice
-- (enforced in app code, see app/(app)/team-leaders/actions.ts), but a
-- team_leader/admin profile can now have a row in more than one team.
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_profile_id_key;
ALTER TABLE team_members ADD CONSTRAINT team_members_team_id_profile_id_key UNIQUE (team_id, profile_id);
