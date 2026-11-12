-- QA analysts' roster: a fixed 08:00-17:00 Mon-Fri schedule, every week.
-- Reuses rotation pattern 'J' (7-day cycle: Mon-Fri EARLY / Sat-Sun OFF,
-- anchored to a Monday - created by billing-team-fixed-roster.sql), assigned
-- as each QA analyst's personal pattern (profiles.rotation_pattern_id, same
-- mechanism team leaders use, see team-leader-personal-rotation-patterns.sql).
-- 'EARLY' resolves to 08:00-17:00 via shiftToTemplate() in
-- lib/roster/resolveShift.ts, so no ongoing maintenance is needed.
-- Requires pattern 'J' to exist (billing-team-fixed-roster.sql applied first).
-- Idempotent - only touches QA analysts that have no pattern yet.

UPDATE profiles
SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'J')
WHERE role = 'qa_analyst'
  AND is_active = true
  AND rotation_pattern_id IS NULL
  AND EXISTS (SELECT 1 FROM roster_rotation_patterns WHERE code = 'J');
