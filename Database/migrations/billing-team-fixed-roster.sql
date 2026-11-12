-- Billing team's roster: a fixed, non-rotating 08:00-17:00 Mon-Fri schedule,
-- every week, forever. Uses the same roster_rotation_patterns +
-- teams.rotation_pattern_id mechanism every other active team is on (the
-- older team_rotations/assignShiftToTeamForWeeks path requires someone to
-- manually re-apply it roughly monthly — see e.g. Social RT's rows, which
-- had already lapsed two weeks ago live in SIT — so it's deliberately not
-- used here). 'EARLY' already resolves to 08:00-17:00 via the hardcoded
-- shiftToTemplate() mapping in lib/roster/resolveShift.ts, so a 7-day
-- cycle of Mon-Fri EARLY / Sat-Sun OFF, anchored to any Monday, reproduces
-- exactly "8am-5pm Mon-Fri" with zero ongoing maintenance — same approach
-- lib/roster/rotationEngine.ts's shiftForDate() already uses for every
-- other team's pattern (see e.g. social-rotation-teams.sql). Anchor date
-- 2026-09-07 is a Monday (confirmed); shift_sequence[0] must line up with
-- a Monday for the Mon-Fri/Sat-Sun mapping below to be correct.
--
-- No admin UI exists for creating a rotation pattern (every existing one —
-- codes A-I — was seeded the same way, via a one-off migration), so this
-- follows that same precedent rather than inventing new UI/actions for a
-- one-time setup. Idempotent — safe to re-run.

ALTER TABLE roster_rotation_patterns DROP CONSTRAINT IF EXISTS roster_rotation_patterns_code_check;
ALTER TABLE roster_rotation_patterns ADD CONSTRAINT roster_rotation_patterns_code_check
  CHECK (code = ANY (ARRAY['A','B','C','D','E','F','G','H','I','J']));

INSERT INTO roster_rotation_patterns (code, shift_sequence, anchor_date)
VALUES ('J', ARRAY['EARLY','EARLY','EARLY','EARLY','EARLY','OFF','OFF']::roster_shift[], '2026-09-07')
ON CONFLICT (code) DO NOTHING;

UPDATE teams SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'J')
WHERE name = 'Billing';
