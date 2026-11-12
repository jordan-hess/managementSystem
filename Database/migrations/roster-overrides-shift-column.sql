-- Purely additive: lets a roster_overrides row target the new position
-- system's EARLY/LATE/OFF shift directly, alongside its existing
-- shift_template_id column (which stays exactly as-is for the legacy
-- team-based roster — not touched, not backfilled, not required here).
ALTER TABLE roster_overrides ADD COLUMN IF NOT EXISTS override_shift roster_shift;
