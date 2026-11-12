-- Callback notifications: assignment alerts + 5-minute reminders

-- 1. Add callback_id to notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS callback_id UUID REFERENCES callbacks(id) ON DELETE CASCADE;

-- 2. Expand the type check to cover all current values
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('info', 'followup', 'escalation', 'reminder', 'request', 'callback'));

-- 3. Add created_by and reminder_sent to callbacks
ALTER TABLE callbacks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
ALTER TABLE callbacks ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;

-- 5. Reset reminder flag whenever the scheduled time changes (e.g. after reschedule)
CREATE OR REPLACE FUNCTION reset_callback_reminder()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scheduled_at <> OLD.scheduled_at THEN
    NEW.reminder_sent := FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS callbacks_reset_reminder ON callbacks;
CREATE TRIGGER callbacks_reset_reminder
  BEFORE UPDATE ON callbacks
  FOR EACH ROW EXECUTE FUNCTION reset_callback_reminder();

-- 6. Function that fires 5-minute reminders (called by pg_cron every minute)
CREATE OR REPLACE FUNCTION send_callback_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Atomically mark callbacks as notified and insert the notification rows
  WITH due AS (
    UPDATE callbacks
    SET reminder_sent = TRUE
    WHERE status = 'pending'
      AND reminder_sent = FALSE
      AND scheduled_at > NOW()
      AND scheduled_at <= (NOW() + INTERVAL '5 minutes')
    RETURNING id, agent_id, customer_id
  )
  INSERT INTO notifications (recipient_id, callback_id, title, message, type)
  SELECT
    d.agent_id,
    d.id,
    'Upcoming Callback: ' || c.name,
    'You have a callback with ' || c.name || ' scheduled in 5 minutes.',
    'reminder'
  FROM due d
  JOIN customers c ON c.id = d.customer_id;
END;
$$;

-- 7. Schedule the reminder job (runs every minute)
-- Requires pg_cron extension. Enable it in the Supabase dashboard under
-- Database → Extensions → pg_cron, then run this line:
--
--   SELECT cron.schedule('callback-reminders', '* * * * *', 'SELECT send_callback_reminders()');
--
-- To verify the job was created:  SELECT * FROM cron.job;
-- To remove it:                   SELECT cron.unschedule('callback-reminders');
