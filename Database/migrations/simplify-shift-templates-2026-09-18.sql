-- Product decision: the "Shift Rotations" screen (per-team weekly
-- drag-and-drop shift assignment, plus arbitrary shift-template CRUD) is
-- removed from the app entirely - see the same-day commit removing
-- ShiftRotationModal.tsx/TeamRotationZone.tsx and the
-- createShiftTemplate/updateShiftTemplate/deleteShiftTemplate/
-- deleteTeamRotation/assignShiftToTeamForWeeks actions that backed it.
-- Going forward, a shift change happens via the new "Shift" option in
-- MarkAttendanceModal instead - a per-day roster_overrides swap-in, not a
-- standing reassignment - and only ever one of exactly two shapes.
--
-- This migration only ensures those two shapes exist as rows (matched by
-- start/end time, not name, in case either was already present under a
-- different label) - it does NOT touch any existing shift_templates or
-- team_rotations data. Removing the assignment UI was a deliberate
-- UI-only change (resolveShift.ts keeps resolving existing team_rotations
-- unchanged), so whatever's already scheduled keeps working exactly as
-- before; only the ability to create new rotations/templates is gone.
--
-- is_late_shift=true on the 11-8 shift (the later-ending of the two) so
-- it keeps participating in is_late_shift's existing purpose (routing
-- rescheduled callbacks to whoever's on the late shift) - revisit if
-- that's not the intent.

INSERT INTO shift_templates (name, start_time, end_time, work_days, description, is_late_shift)
SELECT '8 - 5', '08:00', '17:00', '{1,2,3,4,5,6,7}', 'Standard shift', false
WHERE NOT EXISTS (
  SELECT 1 FROM shift_templates WHERE start_time = '08:00' AND end_time = '17:00'
);

INSERT INTO shift_templates (name, start_time, end_time, work_days, description, is_late_shift)
SELECT '11 - 8', '11:00', '20:00', '{1,2,3,4,5,6,7}', 'Late shift', true
WHERE NOT EXISTS (
  SELECT 1 FROM shift_templates WHERE start_time = '11:00' AND end_time = '20:00'
);
