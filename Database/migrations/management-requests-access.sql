-- ============================================================
-- Let 'management' approve/reject Leave & Overtime requests
-- submitted by team leaders (not by plain, non-leading admins,
-- whose requests stay in the existing admin-only approval pool
-- unchanged). Also auto-notifies every management-role profile
-- when a team leader submits a request, mirroring the existing
-- agent -> team-leader notify trigger.
-- Run this in the Supabase SQL Editor.
-- Safe to run on a live database — no data changes; RLS policies
-- are dropped/recreated; the new function/trigger are additive.
-- ============================================================

-- ─── 1. Helper: is the SUBJECT profile a team leader? ─────────────────────────
-- Distinct from the existing is_team_leader_for(team_id), which checks
-- whether the CURRENT user leads a given team. This checks whether an
-- arbitrary profile (the request's submitter) leads ANY team.

CREATE OR REPLACE FUNCTION is_submitter_team_leader(p_profile_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_leaders WHERE profile_id = p_profile_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ─── 7. Auto-notify every management profile when a team leader submits ────
-- Mirrors notify_team_leader_on_request, but the recipient pool has no
-- natural 1-per-team uniqueness the way team_leaders does, so this loops
-- over every management-role profile instead of picking a single LIMIT 1.

CREATE OR REPLACE FUNCTION notify_management_on_team_leader_request()
RETURNS TRIGGER AS $$
DECLARE
  v_requester_name text;
  v_type_label     text;
  v_mgmt           record;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF NOT is_submitter_team_leader(NEW.profile_id) THEN
      RETURN NEW;
    END IF;

    SELECT full_name INTO v_requester_name FROM profiles WHERE id = NEW.profile_id;

    v_type_label := CASE NEW.type
      WHEN 'leave'    THEN 'leave'
      WHEN 'overtime' THEN 'overtime'
      ELSE NEW.type
    END;

    FOR v_mgmt IN SELECT id FROM profiles WHERE role = 'management' LOOP
      INSERT INTO notifications (
        recipient_id, sender_id, request_id, title, message, type
      ) VALUES (
        v_mgmt.id,
        NEW.profile_id,
        NEW.id,
        'New ' || v_type_label || ' request',
        COALESCE(v_requester_name, 'A team leader') || ' has submitted a ' || v_type_label || ' request requiring your review.',
        'request'
      );
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_management_on_team_leader_request ON requests;
CREATE TRIGGER trg_notify_management_on_team_leader_request
  AFTER INSERT ON requests
  FOR EACH ROW EXECUTE FUNCTION notify_management_on_team_leader_request();