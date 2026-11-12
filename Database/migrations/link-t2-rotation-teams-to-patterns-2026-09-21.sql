-- Links the T2 Rotation A/B/C/D teams (roster-t2-rotation-teams-seed.sql)
-- to the rotation patterns seeded for them (roster-positions-schema.sql /
-- roster-positions-seed-september.sql's header: "positions 1-6 = Pattern
-- A, 7-12 = Pattern B, 13-18 = Pattern C, 19-24 = Pattern D" is the same
-- data as these 4 patterns). social-rotation-teams.sql later reused these
-- same 4 patterns for the Social department, confirming they're
-- structural, reusable rotation data - but nothing ever linked
-- teams.rotation_pattern_id for T2's own teams. Without this, T2 agents
-- resolve to "no_rotation" even with correct team_members rows (see
-- lib/roster/resolveShift.ts - a team only gets an automatic schedule
-- once teams.rotation_pattern_id is set). Idempotent - safe to re-run.

UPDATE teams SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'A') WHERE name = 'T2 Rotation A';
UPDATE teams SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'B') WHERE name = 'T2 Rotation B';
UPDATE teams SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'C') WHERE name = 'T2 Rotation C';
UPDATE teams SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'D') WHERE name = 'T2 Rotation D';
