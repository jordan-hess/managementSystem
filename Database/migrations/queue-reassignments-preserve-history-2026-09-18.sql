-- queue_reassignments.user_id/changed_by were implicitly ON DELETE
-- RESTRICT (no clause given at all in t2-queue-reassignments.sql) - a
-- future hard profile-purge would either have to explicitly DELETE these
-- rows first (destroying the very history it exists to keep) or fail
-- outright. Switch both to ON DELETE SET NULL instead, so this history
-- survives an account being hard-deleted later - same policy just applied
-- to the new agent_status_history table (2026-09-18).
--
-- user_id must be made nullable first - SET NULL requires it.

ALTER TABLE queue_reassignments ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE queue_reassignments DROP CONSTRAINT IF EXISTS queue_reassignments_user_id_fkey;
ALTER TABLE queue_reassignments ADD CONSTRAINT queue_reassignments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE queue_reassignments DROP CONSTRAINT IF EXISTS queue_reassignments_changed_by_fkey;
ALTER TABLE queue_reassignments ADD CONSTRAINT queue_reassignments_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;
