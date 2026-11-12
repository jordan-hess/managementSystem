-- Adds the 'queue_assignment' notification type.
--
-- Sent to an agent when a team leader, management, admin or HOD puts them
-- on a queue (lib/queues/notifications.ts, called by assignQueueAction and
-- assignQueueWeekAction in lib/queues/actions.ts). Self-service queue
-- changes via setMyQueueAction deliberately do NOT notify - telling you
-- about your own click is noise, and it is the same distinction the
-- queue_reassignments audit trail already draws through
-- changed_by = user_id.
--
-- notifications.type is a CHECK, not an enum, so this is a drop-and-recreate
-- with the full list rather than an ALTER TYPE ... ADD VALUE. The list below
-- must stay in sync with NotificationType in types/index.ts; a value in one
-- and not the other either fails this constraint on insert or is invisible
-- to the TypeScript that renders it.
--
-- A queue assignment has no FK column of its own on notifications (there is
-- followup_id, callback_id, request_id, password_reset_request_id but no
-- assignment_id), so the row carries sender_id/related_profile_id for the
-- assigner and NotificationBell routes the click to /tickets, where the
-- agent actually works the queue.
--
-- Apply by hand, as with every file in this directory. DATABASE_URL lives
-- in .env.local and never reaches your shell, so export it first:
--   Git Bash:   export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env.local)"
--   PowerShell: $env:DATABASE_URL = ((Select-String -Path .env.local -Pattern '^DATABASE_URL=').Line -replace '^DATABASE_URL=','')
--   psql "$DATABASE_URL" -c "select current_database(), inet_server_addr();"
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f Database/migrations/queue-assignment-notifications-2026-09-23.sql
--
-- Idempotent - drops and recreates the constraint with the full list.

BEGIN;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'info',
    'followup',
    'escalation',
    'reminder',
    'request',
    'callback',
    'warning',
    'attendance_pattern',
    'schedule_conflict',
    'password_reset',
    -- Added 2026-09-23
    'queue_assignment'
  ]::text[]));

COMMIT;

-- Verify (expect 'queue_assignment' in the definition):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'notifications_type_check';
