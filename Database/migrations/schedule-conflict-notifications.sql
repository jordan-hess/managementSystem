-- New notification type for the "assigned agent is off tomorrow" alert on
-- escalations/follow-ups (see lib/roster/scheduleAlerts.ts) — its own type,
-- matching this table's existing pattern of adding a dedicated type per
-- distinct alert (warning, callback, attendance_pattern) rather than
-- overloading 'reminder'.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('info', 'followup', 'escalation', 'reminder', 'request', 'callback', 'warning', 'attendance_pattern', 'schedule_conflict'));
