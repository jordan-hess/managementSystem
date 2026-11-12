-- T2 tickets: 'callback' becomes a first-class status directly on the
-- ticket, mirroring support_tickets' status='callback' + callback_scheduled_at/
-- callback_notes pattern (support-tickets-status-fields.sql), instead of the
-- old scheduled_callbacks side-table approach — that table had a write path
-- (scheduleCallbackAction) but no read path anywhere, so a scheduled callback
-- was invisible everywhere except a ticket's own event-timeline note.
-- scheduled_callbacks is left in place, just unused, rather than dropped.

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('open','in_progress','escalated','awaiting_t3','t3_responded','resolved','closed','callback'));

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS callback_scheduled_at TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS callback_notes TEXT;
