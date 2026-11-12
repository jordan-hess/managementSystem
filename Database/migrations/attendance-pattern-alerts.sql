-- Flags agents marked sick more than once without a doctor's note within a
-- rolling 6-week window, and notifies their team leader with an alert the
-- notification bell renders action buttons for (issue verbal/written/final
-- warning). Mirrors notify-team-leader-on-reassignment.sql's existing
-- trigger-based "notify the team leader" pattern. Idempotent — safe to
-- re-run.

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS has_doctor_note boolean NOT NULL DEFAULT false;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_profile_id uuid REFERENCES profiles(id);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('info', 'followup', 'escalation', 'reminder', 'request', 'callback', 'warning', 'attendance_pattern'));

CREATE OR REPLACE FUNCTION notify_team_leader_on_sick_pattern()
RETURNS TRIGGER AS $$
DECLARE
  v_leader_id   uuid;
  v_agent_name  text;
  v_sick_count  int;
BEGIN
  IF NEW.status <> 'sick' THEN
    RETURN NEW;
  END IF;

  -- Only a genuine transition into 'sick' re-evaluates the pattern — editing
  -- notes/has_doctor_note on an already-sick row, or any other column touch,
  -- must not re-fire this (has_doctor_note itself is set in the same write
  -- that sets status='sick' from the Mark Attendance modal, so this still
  -- sees the row's final has_doctor_note value below).
  IF TG_OP = 'UPDATE' AND OLD.status = 'sick' THEN
    RETURN NEW;
  END IF;

  IF NEW.has_doctor_note THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT COUNT(*) INTO v_sick_count
      FROM attendance_records
     WHERE profile_id = NEW.profile_id
       AND status = 'sick'
       AND has_doctor_note = false
       AND date BETWEEN (NEW.date - 41) AND NEW.date;

    IF v_sick_count < 2 THEN
      RETURN NEW;
    END IF;

    SELECT tl.profile_id
      INTO v_leader_id
      FROM team_members tm
      JOIN team_leaders tl ON tl.team_id = tm.team_id
     WHERE tm.profile_id = NEW.profile_id
     LIMIT 1;

    IF v_leader_id IS NULL OR v_leader_id = NEW.profile_id THEN
      RETURN NEW;
    END IF;

    SELECT full_name INTO v_agent_name FROM profiles WHERE id = NEW.profile_id;

    INSERT INTO notifications (
      recipient_id, sender_id, related_profile_id, title, message, type
    ) VALUES (
      v_leader_id,
      NEW.profile_id,
      NEW.profile_id,
      'Unexplained sick leave pattern',
      COALESCE(v_agent_name, 'An agent') || ' has been marked sick ' || v_sick_count ||
        ' times without a doctor''s note in the last 6 weeks. Choose a warning to issue below.',
      'attendance_pattern'
    );

  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_team_leader_on_sick_pattern ON attendance_records;
CREATE TRIGGER trg_notify_team_leader_on_sick_pattern
  AFTER INSERT OR UPDATE OF status, has_doctor_note ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION notify_team_leader_on_sick_pattern();
