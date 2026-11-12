-- Home page: fully private notepad, multiple free-text notes per user.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS personal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_notes_profile_id ON personal_notes (profile_id);