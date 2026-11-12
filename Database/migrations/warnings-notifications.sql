-- ============================================================
-- Add 'warning' to the notifications type CHECK constraint, so a
-- warning's recipient can be notified — mirrors the existing
-- callback-notifications.sql pattern for adding a new type.
-- Run this in the Supabase SQL Editor.
-- Safe to run on a live database — no data changes.
-- ============================================================

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('info', 'followup', 'escalation', 'reminder', 'request', 'callback', 'warning'));
