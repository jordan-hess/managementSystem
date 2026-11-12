-- Local in-memory database only (lib/db/local/bootstrap.ts). Runs after
-- every migration to pin the final state where replaying files without a
-- manifest lands on an earlier definition.

-- add-team-leader-and-t3-roles.sql sorts after add-hod-role.sql and narrows
-- the role list again; the live DB allows all seven (see lib/auth/authz.ts's Role).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('agent', 'admin', 'management', 'team_leader', 't3', 'qa_analyst', 'hod'));
