-- Extends the existing new-request notification trigger to also fire when a
-- pending request's team_id changes (via sync-pending-requests-team.sql's
-- trigger, when an agent/team leader is moved to a different team) — not
-- just on brand-new submissions. Without this, a request that lands in a
-- new team leader's queue via reassignment gives them no notification at
-- all. Run this once in the Supabase SQL Editor, after
-- sync-pending-requests-team.sql.
-- Safe to run on a live database — replaces the function body and trigger
-- definition, no data changes.

CREATE OR REPLACE FUNCTION notify_team_leader_on_request()
RETURNS TRIGGER AS $$
DECLARE
  v_leader_id      uuid;
  v_requester_name text;
  v_type_label     text;
  v_title          text;
  v_message        text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF NEW.team_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Column-level UPDATE triggers fire whenever the column is in the SET
  -- list, even if the value is unchanged. The approval flow (status,
  -- admin_comment, reviewed_by, reviewed_at) never touches team_id, so in
  -- practice only the reassignment trigger updates it — but guard anyway so
  -- a same-team no-op update never sends a spurious notification.
  IF TG_OP = 'UPDATE' AND OLD.team_id = NEW.team_id THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT tl.profile_id
      INTO v_leader_id
      FROM team_leaders tl
     WHERE tl.team_id = NEW.team_id
     LIMIT 1;

    IF v_leader_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF v_leader_id = NEW.profile_id THEN
      RETURN NEW;
    END IF;

    SELECT full_name INTO v_requester_name
      FROM profiles WHERE id = NEW.profile_id;

    v_type_label := CASE NEW.type
      WHEN 'leave'    THEN 'leave'
      WHEN 'overtime' THEN 'overtime'
      ELSE NEW.type
    END;

    IF TG_OP = 'INSERT' THEN
      v_title   := 'New ' || v_type_label || ' request';
      v_message := COALESCE(v_requester_name, 'An agent') || ' has submitted a ' || v_type_label || ' request requiring your review.';
    ELSE
      v_title   := v_type_label || ' request reassigned to your team';
      v_message := COALESCE(v_requester_name, 'An agent') || '''s pending ' || v_type_label || ' request was reassigned to your team and needs your review.';
    END IF;

    INSERT INTO notifications (
      recipient_id, sender_id, request_id, title, message, type
    ) VALUES (
      v_leader_id,
      NEW.profile_id,
      NEW.id,
      v_title,
      v_message,
      'request'
    );

  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_team_leader_on_request ON requests;
CREATE TRIGGER trg_notify_team_leader_on_request
  AFTER INSERT OR UPDATE OF team_id ON requests
  FOR EACH ROW EXECUTE FUNCTION notify_team_leader_on_request();
