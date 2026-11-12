-- Restores the notify_management_on_team_leader_request trigger dropped in
-- remove-management-team-leader-request-notification.sql — that removal was
-- based on a misunderstanding; Management (and HOD, closing a pre-existing
-- gap where the original function only notified role='management') DO want
-- an active notification when a team leader/admin submits a request, not
-- just passive visibility in Pending Requests.
-- Idempotent — safe to re-run.

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

    -- role IN ('management', 'hod') — widened from 'management' only, to
    -- match the Pending Requests visibility rule (Management/HOD both see
    -- team-leader-authored requests) that this notification backs.
    FOR v_mgmt IN SELECT id FROM profiles WHERE role IN ('management', 'hod') LOOP
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
