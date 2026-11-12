

-- INSERT policy ("Authenticated users can insert followups") only checks
-- created_by = auth.uid() with no role branch — management already
-- satisfies this unmodified; no change needed there.

-- ─── 2. followup_status_history table ─────────────────────────────────────────
-- Immutable audit log, universal (every followup, any creator). No UPDATE
-- or DELETE policies are granted.

CREATE TABLE IF NOT EXISTS followup_status_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id  uuid        NOT NULL REFERENCES followups(id) ON DELETE CASCADE,
  changed_by   uuid        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  from_status  text        NOT NULL,
  to_status    text        NOT NULL,
  comment      text,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_status_history_followup_id ON followup_status_history (followup_id);
CREATE INDEX IF NOT EXISTS idx_followup_status_history_changed_by ON followup_status_history (changed_by);
CREATE INDEX IF NOT EXISTS idx_followup_status_history_changed_at ON followup_status_history (changed_at);