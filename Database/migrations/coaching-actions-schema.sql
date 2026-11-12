-- Holistic QA Platform — coaching workflow. Replaces the old
-- coaching_feedback/coaching_agent_checkins/coaching_leader_checkins/
-- coaching_weekly_stats system (dropped in coaching-workflow-drop-old-system.sql)
-- with a structured, review-driven action instead of free-text notes and
-- monthly checkboxes. No RLS — this app enforces authorization in app code.
-- Idempotent.

CREATE TABLE IF NOT EXISTS coaching_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id         uuid NOT NULL REFERENCES qa_reviews(id) ON DELETE CASCADE,
  -- Denormalized from qa_reviews.agent_id at creation time — not derived
  -- solely by joining through review_id, so per-agent/team coaching
  -- reporting (open/overdue counts, completion rates) can query this table
  -- directly. A review's agent_id never changes post-creation, so this
  -- never needs to be kept in sync after the row is written.
  agent_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  category          text NOT NULL,
  notes             text,
  required_action   text NOT NULL,
  due_date          date,
  owner_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed')),
  completed_at      timestamptz,
  completed_by      uuid REFERENCES profiles(id) ON DELETE RESTRICT,
  created_by        uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- "Overdue" is a 4th UI-facing status computed from status+due_date, never
  -- stored — see the design spec's "Overdue is computed, not stored" note.
  CHECK ((status = 'completed') = (completed_at IS NOT NULL AND completed_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS coaching_actions_review_id_idx ON coaching_actions (review_id);
CREATE INDEX IF NOT EXISTS coaching_actions_agent_id_idx ON coaching_actions (agent_id);
CREATE INDEX IF NOT EXISTS coaching_actions_owner_id_idx ON coaching_actions (owner_id);
