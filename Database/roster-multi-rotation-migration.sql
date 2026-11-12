-- ============================================================
-- Migration: allow multiple rotations per team per week
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Drop the old constraint that allowed only ONE shift per team per week
ALTER TABLE team_rotations
  DROP CONSTRAINT team_rotations_team_id_week_start_date_key;

-- Add a new constraint: a team cannot be assigned the same shift template
-- twice in the same week, but CAN have different templates (e.g. Morning + Night)
ALTER TABLE team_rotations
  ADD CONSTRAINT team_rotations_team_week_shift_unique
  UNIQUE (team_id, week_start_date, shift_template_id);
