-- Corrects course from roster-positions-schema.sql / roster-positions-seed-
-- september.sql: per explicit user correction, there is no standalone
-- "position number" concept and no separate admin page — the rotation
-- pattern (roster_rotation_patterns, unchanged) is instead assigned per
-- TEAM, using the app's existing teams/team_members mechanism (Team
-- Management's existing drag-and-drop already changes an agent's rotation,
-- since it changes which team they're on). roster_rotation_patterns and
-- roster_overrides.override_shift are unaffected and still correct.

DROP TABLE IF EXISTS roster_position_assignments;
DROP TABLE IF EXISTS roster_positions;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS rotation_pattern_id uuid REFERENCES roster_rotation_patterns(id);
