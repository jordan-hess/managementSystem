-- Widens the existing 3-tier notification pattern already used for
-- leave/overtime requests (notify_management_on_team_leader_request) to
-- password-reset requests: when an admin, team_leader, t3, or qa_analyst
-- submits a self-service password reset (POST /api/auth/
-- request-password-reset), notify Management/HOD plus every OTHER admin
-- and team_leader (never the requester themselves) - not just passive
-- visibility in the Roster "Password Resets" tab, which (per the
-- 2026-09-17 privilege-escalation fix) only ever shows agent/team_leader-
-- authored requests to team_leader/admin reviewers. Without this, an
-- admin/t3/qa_analyst-submitted request currently has no visibility
-- anywhere.
--
-- Purely an informational side effect, same as every other notify_*
-- trigger in this file set - not an authorization boundary. It does NOT
-- change who is allowed to approve/reject a request; that stays governed
-- by app code in app/api/admin/review-password-reset/route.ts.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS password_reset_request_id
  UUID REFERENCES password_reset_requests(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_password_reset_request_id
  ON notifications (password_reset_request_id);

-- Widen the type CHECK to add 'password_reset' - based on the fullest
-- prior version of this constraint (schedule-conflict-notifications.sql),
-- not notifications-type-check-restore.sql's list, which predates
-- attendance_pattern/schedule_conflict being added and would silently
-- narrow the constraint against existing rows of those types if used here.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('info', 'followup', 'escalation', 'reminder', 'request', 'callback', 'warning', 'attendance_pattern', 'schedule_conflict', 'password_reset'));

CREATE OR REPLACE FUNCTION notify_on_privileged_password_reset_request()
RETURNS TRIGGER AS $$
DECLARE
  v_requester_name text;
  v_requester_role text;
  v_recipient      record;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT full_name, role INTO v_requester_name, v_requester_role
    FROM profiles WHERE id = NEW.profile_id;

    IF v_requester_role IS NULL OR v_requester_role NOT IN ('admin', 'team_leader', 't3', 'qa_analyst') THEN
      RETURN NEW;
    END IF;

    FOR v_recipient IN
      SELECT id FROM profiles
      WHERE role IN ('management', 'hod')
         OR (role IN ('admin', 'team_leader') AND id <> NEW.profile_id)
    LOOP
      INSERT INTO notifications (
        recipient_id, sender_id, password_reset_request_id, title, message, type
      ) VALUES (
        v_recipient.id,
        NEW.profile_id,
        NEW.id,
        'Password reset requested',
        COALESCE(v_requester_name, 'A user') || ' has requested a password reset.',
        'password_reset'
      );
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_on_privileged_password_reset_request ON password_reset_requests;
CREATE TRIGGER trg_notify_on_privileged_password_reset_request
  AFTER INSERT ON password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION notify_on_privileged_password_reset_request();
