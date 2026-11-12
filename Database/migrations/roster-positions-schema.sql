-- Automatic Position-Based Roster (24 positions, 4 patterns, 28-day cycle).
-- Purely additive — does not touch teams/team_members/team_leaders (used by
-- unrelated features) or shift_templates/team_rotations (retired only after
-- a verified parallel-comparison period, per the migration plan; not in
-- this migration).

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE roster_shift AS ENUM ('EARLY', 'LATE', 'OFF');

-- One row per rotation pattern (A/B/C/D). shift_sequence[1] is the shift on
-- anchor_date; shiftForDate() (lib/roster/rotationEngine.ts) is the only
-- code that ever reads this table's rotation math — it never knows about
-- positions, agents, or calendar months.
CREATE TABLE roster_rotation_patterns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE CHECK (code IN ('A', 'B', 'C', 'D')),
  shift_sequence roster_shift[] NOT NULL,
  anchor_date    date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (array_length(shift_sequence, 1) = 28)
);

-- The 24 fixed positions. profile_id is a convenience cache of the CURRENT
-- occupant only — roster_position_assignments below is the sole
-- authoritative source for any date-based (historical or current) lookup.
CREATE TABLE roster_positions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_number int  NOT NULL UNIQUE CHECK (position_number BETWEEN 1 AND 24),
  pattern_id      uuid NOT NULL REFERENCES roster_rotation_patterns(id),
  profile_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

CREATE INDEX idx_roster_positions_pattern_id ON roster_positions (pattern_id);

-- Time-bounded occupancy history. A reassignment closes the current row
-- (effective_to) and opens a new one — never overwrites or deletes history.
CREATE TABLE roster_position_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id    uuid NOT NULL REFERENCES roster_positions(id) ON DELETE CASCADE,
  profile_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  effective_from date NOT NULL,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_roster_position_assignments_position_id ON roster_position_assignments (position_id);
CREATE INDEX idx_roster_position_assignments_profile_id ON roster_position_assignments (profile_id);

-- A position can't have two overlapping occupancy periods.
ALTER TABLE roster_position_assignments
  ADD CONSTRAINT roster_position_assignments_no_overlap
  EXCLUDE USING gist (
    position_id WITH =,
    daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
  );

-- An agent can't hold two positions at once.
ALTER TABLE roster_position_assignments
  ADD CONSTRAINT roster_agent_assignments_no_overlap
  EXCLUDE USING gist (
    profile_id WITH =,
    daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
  )
  WHERE (profile_id IS NOT NULL);
