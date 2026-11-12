-- 4 teams for the T2 rotation roster (September CSV), one per pattern.
-- Distinct from the pre-existing "T2 Networks" teams (blue/green), which
-- have their own, unrelated members and are untouched by this migration.

INSERT INTO teams (name, color, description)
SELECT v.name, v.color, 'Automatic 28-day rotation roster'
FROM (VALUES
  ('T2 Rotation A', 'green'),
  ('T2 Rotation B', 'blue'),
  ('T2 Rotation C', 'red'),
  ('T2 Rotation D', 'yellow')
) AS v(name, color)
WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = v.name);

UPDATE teams t
SET rotation_pattern_id = p.id
FROM roster_rotation_patterns p
WHERE t.name = 'T2 Rotation A' AND p.code = 'A'
   OR t.name = 'T2 Rotation B' AND p.code = 'B'
   OR t.name = 'T2 Rotation C' AND p.code = 'C'
   OR t.name = 'T2 Rotation D' AND p.code = 'D';
