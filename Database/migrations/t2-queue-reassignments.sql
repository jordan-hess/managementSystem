-- T2 Queue Hub merge — Midday Queue Reassignment.
--
-- agent_queue_assignments (one row per agent per day, upserted) only ever
-- holds the *current* queue for a given day — a midday reassignment
-- overwrites it, losing the previous queue and the reason for the change.
-- This is an append-only audit log alongside it: every assignment or
-- reassignment (single-day or week) writes one row here, capturing exactly
-- what the spec requires (effective date/time, previous queue, new queue,
-- reason, and the Team Lead responsible), without disturbing
-- agent_queue_assignments' existing "current queue for today" role.
CREATE TABLE IF NOT EXISTS queue_reassignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id),
  date            text NOT NULL,  -- the agent_queue_assignments.date this change applies to
  previous_queue  text,           -- null if the agent had no assignment yet that day
  new_queue       text NOT NULL,
  reason          text,
  changed_by      uuid REFERENCES profiles(id),
  effective_at    text DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_queue_reassignments_user ON queue_reassignments(user_id);
CREATE INDEX IF NOT EXISTS idx_queue_reassignments_date ON queue_reassignments(date);
