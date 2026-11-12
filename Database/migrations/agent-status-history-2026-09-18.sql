-- agent_status only ever holds the *current* Active/On Break/In a
-- Meeting/Inactive status (one row per user, upserted) - every change
-- overwrites the last one, losing when/why it changed. This is an
-- append-only audit log alongside it, mirroring exactly how
-- agent_queue_assignments/queue_reassignments already split "current
-- state" from "history" (see t2-queue-reassignments.sql): every status
-- change writes one row here, capturing the previous status, the new
-- one, and who changed it (a real profile id for self-service or a
-- team-lead/admin action; NULL for the two system-triggered cases -
-- applyShiftEndAutoInactive's auto-inactive sweep, and there is no
-- system-triggered auto-active case distinct from a real login).
--
-- user_id/changed_by are ON DELETE SET NULL, not RESTRICT/CASCADE: history
-- should survive an account being hard-deleted later, rather than either
-- blocking the deletion or being destroyed along with it (explicit product
-- decision, 2026-09-18 - see also queue-reassignments-preserve-history-
-- 2026-09-18.sql, which retrofits the same policy onto the pre-existing
-- queue_reassignments table).

CREATE TABLE IF NOT EXISTS agent_status_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  previous_status text,
  new_status      text NOT NULL,
  changed_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  effective_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_status_history_user_id ON agent_status_history (user_id);
CREATE INDEX IF NOT EXISTS idx_agent_status_history_effective_at ON agent_status_history (effective_at);
