-- Marks the 5 team-leader "shadow" teams created by
-- team-leader-personal-roster-september-2026.sql as scheduling-only, so
-- Team Management (app/(app)/team-leaders/page.tsx and
-- app/(app)/admin/agents/page.tsx, both of which list every teams row
-- unfiltered) can exclude them — they exist purely so resolveShift/
-- buildSlotMap has a team_members row to resolve each team leader's own
-- roster against, not as real organizational teams to manage members of.
-- The roster page's own teams query is deliberately NOT filtered by this
-- flag — it needs every team, shadow ones included, to resolve the
-- Team Leaders grid section correctly.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_scheduling_only BOOLEAN NOT NULL DEFAULT false;

UPDATE teams SET is_scheduling_only = true
WHERE id IN (
  '2375c424-14a5-4f37-91b9-35166df74a1b', -- TL Roster — Taylor
  'a3150ae2-c2f9-47c2-83f7-1e12f9514b71', -- TL Roster — Jamie
  '5578b99b-d16b-4920-a2e4-4fff44d39026', -- TL Roster — Casey Hughes
  '5f47fcae-eb0e-4002-a372-2396e3c7b433', -- TL Roster — Dev Team Leader
  '42cffa27-7e6d-4655-9a1c-add96c4b12b3'  -- TL Roster — Riley
);
