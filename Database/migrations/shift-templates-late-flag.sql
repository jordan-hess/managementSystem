-- Adds an explicit flag for which shift templates count as a "late shift",
-- so callback rescheduling can look up which team is rostered on a late
-- shift for a given date (previously no such concept existed on
-- shift_templates — shift names like "LateShift"/"Late weekend" were just
-- free text with no queryable signal).
-- Idempotent — safe to re-run.

ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS is_late_shift boolean NOT NULL DEFAULT false;
