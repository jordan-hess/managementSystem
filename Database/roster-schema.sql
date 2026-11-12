-- ============================================================
-- Team Roster Schema
-- Run this in the Supabase SQL Editor after schema.sql
-- ============================================================

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  color       text NOT NULL,       -- 'green' | 'blue' | 'red' | 'yellow'
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_teams_name ON teams (name);

CREATE TABLE team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)   -- one active team per agent
);
CREATE INDEX idx_team_members_team_id    ON team_members (team_id);
CREATE INDEX idx_team_members_profile_id ON team_members (profile_id);

CREATE TABLE shift_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  work_days   int[] NOT NULL,   -- ISO day-of-week: 1=Mon … 7=Sun
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_rotations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  shift_template_id uuid NOT NULL REFERENCES shift_templates(id) ON DELETE RESTRICT,
  week_start_date   date NOT NULL,   -- always a Monday (YYYY-MM-DD)
  created_by        uuid NOT NULL REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, week_start_date)
);
CREATE INDEX idx_team_rotations_team_id          ON team_rotations (team_id);
CREATE INDEX idx_team_rotations_week_start_date  ON team_rotations (week_start_date);

CREATE TYPE attendance_status AS ENUM ('on_shift', 'late', 'absent', 'sick', 'leave', 'off');

CREATE TABLE attendance_records (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date       date NOT NULL,
  status     attendance_status NOT NULL DEFAULT 'on_shift',
  notes      text,
  marked_by  uuid NOT NULL REFERENCES profiles(id),
  marked_at  timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, date)
);
CREATE INDEX idx_attendance_profile_id ON attendance_records (profile_id);
CREATE INDEX idx_attendance_date       ON attendance_records (date);

CREATE TABLE roster_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date              date NOT NULL,
  override_type     text NOT NULL CHECK (override_type IN ('off', 'swap_in', 'extra_shift')),
  shift_template_id uuid REFERENCES shift_templates(id) ON DELETE SET NULL,
  notes             text,
  created_by        uuid NOT NULL REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, date)
);
CREATE INDEX idx_roster_overrides_profile_id ON roster_overrides (profile_id);
CREATE INDEX idx_roster_overrides_date       ON roster_overrides (date);

-- ─── Triggers ────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_shift_templates_updated_at
  BEFORE UPDATE ON shift_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_attendance_records_updated_at
  BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Seed Data ────────────────────────────────────────────────────────────────

INSERT INTO teams (name, color) VALUES
  ('Green',  'green'),
  ('Blue',   'blue'),
  ('Red',    'red'),
  ('Yellow', 'yellow');

INSERT INTO shift_templates (name, start_time, end_time, work_days) VALUES
  ('Morning',    '06:00', '14:00', '{1,2,3,4,5}'),
  ('Afternoon',  '14:00', '22:00', '{1,2,3,4,5}'),
  ('Night',      '22:00', '06:00', '{1,2,3,4,5}'),
  ('Weekend AM', '07:00', '15:00', '{6,7}');