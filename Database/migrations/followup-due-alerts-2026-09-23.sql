-- Adds followups.due_alert_sent, the claim flag for the "follow-up falls due
-- while its agent is rostered off" alert (lib/notifications/dueSweep.ts).
--
-- Mirrors callbacks.reminder_sent, which
-- Database/migrations/callback-notifications.sql uses for exactly the same
-- job: an atomic UPDATE ... WHERE <flag> = FALSE ... RETURNING claims each
-- row once, so concurrent callers cannot double-alert. That property is what
-- lets the sweep be driven by NotificationBell's 30-second poll — every
-- signed-in user runs it, and only one of them wins each row.
--
-- NAMING: "sent" is slightly generous. The flag means "the 10-minute due
-- check has been answered for this follow-up", and the sweep sets it for
-- every follow-up in the window, including those whose agent turns out to be
-- ON shift and therefore generate no notification. Re-asking that question
-- every 30 seconds until the due time passed would be wasted work. Kept as
-- `_sent` for symmetry with callbacks.reminder_sent rather than inventing a
-- second convention.
--
-- WHY THIS EXISTS AT ALL: pg_cron is not installed on this cluster and is
-- not even in pg_available_extensions, so the scheduler that
-- callback-notifications.sql assumed ("enable it in the Supabase dashboard")
-- never existed here. send_callback_reminders() has been correct and
-- uncalled ever since. The poll-driven sweep is the stand-in; if pg_cron is
-- ever enabled this column stays exactly as useful.
--
-- BACKFILL: existing rows default to FALSE, which would make the first sweep
-- consider every open follow-up ever created. The sweep's own window bounds
-- it (due within the next 10 minutes, and not more than 60 minutes past due)
-- so history cannot stampede, but anything already long overdue is marked
-- TRUE below so the first run after deploy starts from a clean slate rather
-- than alerting on a backlog.
--
-- Apply by hand, as with every file in this directory. DATABASE_URL lives in
-- .env.local and never reaches your shell, so export it first:
--   Git Bash:   export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env.local)"
--   PowerShell: $env:DATABASE_URL = ((Select-String -Path .env.local -Pattern '^DATABASE_URL=').Line -replace '^DATABASE_URL=','')
--   psql "$DATABASE_URL" -c "select current_database(), inet_server_addr();"
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f Database/migrations/followup-due-alerts-2026-09-23.sql
--
-- Idempotent - IF NOT EXISTS on the column, and the backfill is a no-op on
-- a second run.

BEGIN;

ALTER TABLE followups ADD COLUMN IF NOT EXISTS due_alert_sent BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN followups.due_alert_sent IS
  'Claim flag for the 10-minute due alert in lib/notifications/dueSweep.ts. TRUE once the check has run for this follow-up, whether or not it produced a notification.';

-- Anything already past the sweep''s own staleness window is pre-claimed, so
-- the first run after deploy does not alert on historical follow-ups.
UPDATE followups
SET due_alert_sent = TRUE
WHERE due_alert_sent = FALSE
  AND due_date IS NOT NULL
  AND due_date < (NOW() - INTERVAL '60 minutes');

-- The sweep runs every 30 seconds, so its predicate needs an index rather
-- than a sequential scan of the whole table. Partial, because the only rows
-- it ever looks at are unclaimed ones with a due date.
CREATE INDEX IF NOT EXISTS followups_due_alert_pending_idx
  ON followups (due_date)
  WHERE due_alert_sent = FALSE AND due_date IS NOT NULL;

COMMIT;

-- Verify:
--   SELECT count(*) FILTER (WHERE due_alert_sent) AS claimed,
--          count(*) FILTER (WHERE NOT due_alert_sent) AS pending
--   FROM followups;
