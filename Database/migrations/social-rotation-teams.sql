-- Extends the automatic 28-day rotation to the Social department, reusing
-- the same 4 patterns already seeded for T2 (verified byte-identical to the
-- Social department's own September data, cross-checked against real
-- August data across the Aug->Sep boundary). Per explicit user
-- instruction, no team membership is changed here — only the existing
-- teams' rotation_pattern_id is set, matching each team's already-current
-- membership to the pattern it matches:
--   Social LTE   -> Pattern B
--   Social RT    -> Pattern D
--   Social Stars -> Pattern C
--   Social UCT   -> Pattern A

UPDATE teams SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'B') WHERE name = 'Social LTE';
UPDATE teams SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'D') WHERE name = 'Social RT';
UPDATE teams SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'C') WHERE name = 'Social Stars';
UPDATE teams SET rotation_pattern_id = (SELECT id FROM roster_rotation_patterns WHERE code = 'A') WHERE name = 'Social UCT';

-- Per-agent leave days found in the September source data — layered on top
-- of the base rotation via attendance_records, exactly like any other
-- attendance record; never baked into the pattern itself.
INSERT INTO attendance_records (profile_id, date, status, marked_by)
SELECT p.id, v.date::date, 'leave', p.id
FROM (VALUES
  ('11ba1f5e-f148-4ebf-bf74-ae67ea34034a', '2026-09-07'), -- Karisha
  ('11ba1f5e-f148-4ebf-bf74-ae67ea34034a', '2026-09-08'),
  ('11ba1f5e-f148-4ebf-bf74-ae67ea34034a', '2026-09-09'),
  ('11ba1f5e-f148-4ebf-bf74-ae67ea34034a', '2026-09-12'),
  ('11ba1f5e-f148-4ebf-bf74-ae67ea34034a', '2026-09-13'),
  ('11ba1f5e-f148-4ebf-bf74-ae67ea34034a', '2026-09-14'),
  ('e286beac-82de-4ab2-962c-6a544af19426', '2026-09-17'), -- Drew
  ('e286beac-82de-4ab2-962c-6a544af19426', '2026-09-18'),
  ('e286beac-82de-4ab2-962c-6a544af19426', '2026-09-19'),
  ('e286beac-82de-4ab2-962c-6a544af19426', '2026-09-20'),
  ('53b622ab-9291-43e3-a532-b2e513c98322', '2026-09-04'), -- Rofhiwa Masenya
  ('53b622ab-9291-43e3-a532-b2e513c98322', '2026-09-07'),
  ('53b622ab-9291-43e3-a532-b2e513c98322', '2026-09-08'),
  ('53b622ab-9291-43e3-a532-b2e513c98322', '2026-09-09'),
  ('03995f25-b674-4601-85c4-f5b356065dfe', '2026-09-07'), -- Asisipho.Kafile
  ('03995f25-b674-4601-85c4-f5b356065dfe', '2026-09-08'),
  ('03995f25-b674-4601-85c4-f5b356065dfe', '2026-09-09'),
  ('041cdae1-9b0e-42b0-a6ee-6d29b60e20c6', '2026-09-23'), -- Ghiyaath
  ('041cdae1-9b0e-42b0-a6ee-6d29b60e20c6', '2026-09-24'),
  ('854ad4e5-57f5-40e8-8840-87c132d72ad1', '2026-09-05'), -- Grant
  ('526eb00d-af9c-4667-88d6-53d41c295fed', '2026-09-05'), -- Raeesa
  ('f43c8189-4282-41ed-8104-7ad58a57c006', '2026-09-26'), -- Bongekile
  ('f43c8189-4282-41ed-8104-7ad58a57c006', '2026-09-27'),
  ('f43c8189-4282-41ed-8104-7ad58a57c006', '2026-09-28'),
  ('78649207-ab95-48e6-bc94-56fdb153fbe8', '2026-09-12'), -- Chris
  ('1677a8c8-369a-42a4-928e-2ca50bab72dc', '2026-09-19'), -- Sandisiwe
  ('1677a8c8-369a-42a4-928e-2ca50bab72dc', '2026-09-20'),
  ('1677a8c8-369a-42a4-928e-2ca50bab72dc', '2026-09-21'),
  ('fac0b929-11e6-42ad-8070-a5a880020d68', '2026-09-11')  -- Pumeza
) AS v(profile_id, date)
JOIN profiles p ON p.id = v.profile_id::uuid
ON CONFLICT (profile_id, date) DO UPDATE SET status = EXCLUDED.status;
