-- Queue Board: sending an agent to the bench deletes their
-- agent_queue_assignments row and also writes a queue_reassignments audit
-- row. new_queue = NULL means "sent to the bench" (history shows
-- "{previous} -> bench"), so the column must accept NULL.
--
-- Idempotent: DROP NOT NULL on an already-nullable column is a no-op.
-- Apply BEFORE deploying the Queue Board branch - until then, unassign
-- inserts fail.

BEGIN;
ALTER TABLE queue_reassignments ALTER COLUMN new_queue DROP NOT NULL;
COMMIT;
