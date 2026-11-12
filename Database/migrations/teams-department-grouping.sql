-- Adds a department bucket to teams, so Roster's team-filter dropdown
-- (which lists actual teams rows, e.g. "Social RT", "T2 Rotation A",
-- "Billing") can be grouped the same way every other agent-facing filter
-- now is. Backfilled by name prefix, which covers every team currently in
-- use (Social LTE/RT/Stars/UCT, T2 Rotation A-D, Billing) — any future team
-- outside that naming convention is left NULL and shows under "Other" in
-- the UI rather than being silently miscategorized.
-- Idempotent — safe to re-run.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS department TEXT;

UPDATE teams SET department = 'Social' WHERE name LIKE 'Social %' AND department IS DISTINCT FROM 'Social';
UPDATE teams SET department = 'T2' WHERE name LIKE 'T2 %' AND department IS DISTINCT FROM 'T2';
UPDATE teams SET department = 'Billing' WHERE name = 'Billing' AND department IS DISTINCT FROM 'Billing';
