-- Replaces the team-leader "shadow team" hack (team-leader-personal-
-- roster-september-2026.sql, teams-scheduling-only-flag.sql) with a
-- personal rotation pattern attached directly to the profile — a team
-- leader has their own individual shift rotation, not a team's, so there's
-- no reason to fabricate a single-member team just to give resolveShift a
-- team_id to resolve against. See lib/roster/resolveShift.ts's new
-- personalPatterns lookup (checked before team membership) and
-- lib/roster/rotationEngine.ts's now-dynamic (data-driven) cycle length —
-- these 5 patterns are 30 days long (September in full), not the 28 the 4
-- existing Social-team patterns use; shiftForDate() no longer hardcodes 28.
--
-- Source: TLroster.csv (September 2026), parsed programmatically (not
-- hand-transcribed) — see the parse script's output for the exact
-- EARLY/LATE/OFF sequences below. "Gershon" in that CSV is Dev Team
-- Leader's slot per prior explicit instruction (replaces a departed team
-- leader). August is discarded entirely per explicit user correction
-- ("August teamleader roster was messed up and inaccurate").

BEGIN;

-- 1. Widen roster_rotation_patterns.code for 5 new personal patterns, and
--    relax the shift_sequence length check — no longer every pattern is
--    28 days; length is whatever the source data actually gives.
ALTER TABLE roster_rotation_patterns DROP CONSTRAINT roster_rotation_patterns_code_check;
ALTER TABLE roster_rotation_patterns ADD CONSTRAINT roster_rotation_patterns_code_check
  CHECK (code IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'));

ALTER TABLE roster_rotation_patterns DROP CONSTRAINT roster_rotation_patterns_shift_sequence_check;
ALTER TABLE roster_rotation_patterns ADD CONSTRAINT roster_rotation_patterns_shift_sequence_check
  CHECK (array_length(shift_sequence, 1) > 0);

-- 2. A profile's own rotation pattern — independent of team membership.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rotation_pattern_id uuid REFERENCES roster_rotation_patterns(id);

-- 3. The 5 patterns themselves, Sep 1-30 2026 verbatim from TLroster.csv.
INSERT INTO roster_rotation_patterns (code, shift_sequence, anchor_date) VALUES
  ('E', ARRAY['EARLY','EARLY','EARLY','EARLY','OFF','OFF','LATE','LATE','LATE','LATE','LATE','OFF','OFF','EARLY','EARLY','EARLY','EARLY','EARLY','OFF','OFF','EARLY','EARLY','EARLY','OFF','OFF','LATE','LATE','LATE','OFF','OFF']::roster_shift[], '2026-09-01'), -- Taylor
  ('F', ARRAY['LATE','LATE','LATE','LATE','OFF','OFF','EARLY','EARLY','EARLY','EARLY','EARLY','OFF','OFF','EARLY','EARLY','EARLY','OFF','OFF','LATE','LATE','LATE','OFF','OFF','EARLY','EARLY','EARLY','EARLY','OFF','EARLY','EARLY']::roster_shift[], '2026-09-01'), -- Jamie
  ('G', ARRAY['EARLY','EARLY','OFF','OFF','LATE','LATE','EARLY','EARLY','EARLY','OFF','OFF','LATE','LATE','LATE','OFF','OFF','EARLY','EARLY','EARLY','EARLY','OFF','EARLY','EARLY','EARLY','EARLY','EARLY','OFF','LATE','LATE','LATE']::roster_shift[], '2026-09-01'), -- Casey Hughes
  ('H', ARRAY['EARLY','EARLY','OFF','OFF','LATE','LATE','LATE','OFF','OFF','EARLY','EARLY','EARLY','EARLY','OFF','EARLY','EARLY','EARLY','EARLY','EARLY','OFF','LATE','LATE','LATE','LATE','LATE','OFF','OFF','EARLY','EARLY','EARLY']::roster_shift[], '2026-09-01'), -- Dev Team Leader (CSV's "Gershon" row)
  ('I', ARRAY['OFF','OFF','EARLY','EARLY','EARLY','EARLY','OFF','EARLY','EARLY','EARLY','EARLY','EARLY','OFF','LATE','LATE','LATE','LATE','LATE','OFF','OFF','EARLY','EARLY','EARLY','EARLY','OFF','OFF','EARLY','EARLY','EARLY','EARLY']::roster_shift[], '2026-09-01'); -- Riley

-- 4. Assign each team leader their personal pattern.
UPDATE profiles SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'E') WHERE id = '8bebb66a-cd00-466e-9ae8-22a5008735d4'; -- Taylor
UPDATE profiles SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'F') WHERE id = '7c9bf228-c4c4-4d04-a809-c5fdb589d56c'; -- Jamie Carter
UPDATE profiles SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'G') WHERE id = '4ad8bebf-5cff-45d4-92ae-7a3aef40ecd2'; -- Casey.Hughes
UPDATE profiles SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'H') WHERE id = 'd46ad0c5-b6c9-4fd3-99ee-cb89e8ceb60a'; -- Dev Team Leader
UPDATE profiles SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'I') WHERE id = 'f3d76b95-48af-429d-ae55-469a96675d29'; -- Riley

-- 5. Retire the shadow teams. roster_overrides has no team_id FK (it's
--    profile+date keyed) so it needs an explicit delete; team_leaders/
--    team_members/team_rotations all CASCADE from teams(id) and are
--    removed by the DELETE FROM teams below. The September sick/annual-
--    leave attendance_records (team-leader-roster-sep-corrections.sql)
--    are untouched — they still override the pattern the same way, now
--    keyed directly to the profile instead of via a fake team.
DELETE FROM roster_overrides WHERE profile_id IN (
  '8bebb66a-cd00-466e-9ae8-22a5008735d4', -- Taylor
  '7c9bf228-c4c4-4d04-a809-c5fdb589d56c', -- Jamie Carter
  '4ad8bebf-5cff-45d4-92ae-7a3aef40ecd2', -- Casey.Hughes
  'd46ad0c5-b6c9-4fd3-99ee-cb89e8ceb60a', -- Dev Team Leader
  'f3d76b95-48af-429d-ae55-469a96675d29'  -- Riley
);

DELETE FROM teams WHERE id IN (
  '2375c424-14a5-4f37-91b9-35166df74a1b', -- TL Roster — Taylor
  'a3150ae2-c2f9-47c2-83f7-1e12f9514b71', -- TL Roster — Jamie
  '5578b99b-d16b-4920-a2e4-4fff44d39026', -- TL Roster — Casey Hughes
  '5f47fcae-eb0e-4002-a372-2396e3c7b433', -- TL Roster — Dev Team Leader
  '42cffa27-7e6d-4655-9a1c-add96c4b12b3'  -- TL Roster — Riley
);

-- 6. The shadow-team concept no longer exists — nothing sets this column anymore.
ALTER TABLE teams DROP COLUMN IF EXISTS is_scheduling_only;

COMMIT;
