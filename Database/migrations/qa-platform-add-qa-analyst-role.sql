-- Holistic QA Platform (Phase 1) — widen profiles.role to add 'qa_analyst',
-- following add-team-leader-and-t3-roles.sql's exact precedent.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('agent', 'admin', 'management', 'team_leader', 't3', 'qa_analyst'));
