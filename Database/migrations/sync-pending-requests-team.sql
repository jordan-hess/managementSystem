-- Keeps a pending/changes_requested leave/overtime request's team_id in sync
-- with whatever team the requester is currently on, so it shows up in the
-- right team leader's review queue after a team reassignment. Approved and
-- rejected requests are left untouched (historical record).
-- Run this once in the Supabase SQL Editor.
-- Safe to run on a live database — purely additive.

CREATE OR REPLACE FUNCTION sync_pending_requests_team()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE requests
  SET team_id = NEW.team_id, updated_at = now()
  WHERE profile_id = NEW.profile_id
    AND status IN ('pending', 'changes_requested');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_pending_requests_team ON team_members;
CREATE TRIGGER trg_sync_pending_requests_team
  AFTER INSERT OR UPDATE OF team_id ON team_members
  FOR EACH ROW EXECUTE FUNCTION sync_pending_requests_team();
