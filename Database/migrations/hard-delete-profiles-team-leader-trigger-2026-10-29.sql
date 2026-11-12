-- Follow-up to hard-delete-profiles-2026-10-29.sql (run after it).
--
-- trg_enforce_team_leader_is_admin fired on EVERY team_leaders update, so
-- the new team_leaders.assigned_by ON DELETE SET NULL ran it too. When the
-- row's leader is being deleted in the same statement - most commonly an
-- admin who assigned themselves as a team's leader (profile_id =
-- assigned_by, allowed by moveToLeaderSlot) - the trigger finds the leader's
-- profile already gone and raises, making that account undeletable. Found
-- with a rolled-back `DELETE FROM profiles` on SIT (2 such rows there).
--
-- The role check only matters when the leader itself changes, so the
-- trigger now fires on INSERT and on UPDATE OF profile_id only. Idempotent.

DROP TRIGGER IF EXISTS trg_enforce_team_leader_is_admin ON team_leaders;
CREATE TRIGGER trg_enforce_team_leader_is_admin
  BEFORE INSERT OR UPDATE OF profile_id ON team_leaders
  FOR EACH ROW EXECUTE FUNCTION enforce_team_leader_is_admin();
