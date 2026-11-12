-- Adds 'hod' (Head of Department) — same access/permissions tier as
-- 'management' throughout the app (see lib/auth/authz.ts's
-- isAdminOrManagement and every other spot that checks role = 'management').
-- Append-only: widens the existing profiles_role_check constraint (last
-- redefined in qa-platform-add-qa-analyst-role.sql) rather than editing it.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('agent', 'admin', 'management', 'team_leader', 't3', 'qa_analyst', 'hod'));
