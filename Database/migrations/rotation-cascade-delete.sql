-- Deleting a shift template used to fail (ON DELETE RESTRICT) whenever any
-- team_rotations row referenced it, blocking admins from removing a shift
-- that's actually in use. Switched to ON DELETE CASCADE: deleting a shift
-- template now also removes any team_rotations rows using it, which reverts
-- those teams to "no shift" for that week (there's no null-FK state here —
-- "no shift" is simply the absence of a team_rotations row for that
-- team+week+shift, same semantics as everywhere else in this schema).
-- Idempotent — safe to re-run.

ALTER TABLE team_rotations DROP CONSTRAINT IF EXISTS team_rotations_shift_template_id_fkey;
ALTER TABLE team_rotations ADD CONSTRAINT team_rotations_shift_template_id_fkey
  FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id) ON DELETE CASCADE;
