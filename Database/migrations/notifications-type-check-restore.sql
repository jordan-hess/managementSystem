-- Restores notifications_type_check, dropped by the (until-now unapplied)
-- callback-notifications.sql migration's DROP+ADD when it was finally run —
-- its replacement CHECK predated 'warning' being added by a later migration,
-- so it failed against existing warning-type rows and left the constraint
-- entirely missing. Idempotent — safe to re-run.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('info', 'followup', 'escalation', 'reminder', 'request', 'callback', 'warning'));
