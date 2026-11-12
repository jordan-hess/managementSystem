-- Adds indexes on hot-path lookup/foreign-key columns identified during
-- the 2026-09-16 production-readiness audit (finding H10). profiles.email
-- is checked on every login and had no index at all (unlike
-- profiles.username, which is UNIQUE); followups.agent_id, callbacks.agent_id
-- and notifications.recipient_id back every agent-scoped list view;
-- tickets.assigned_to/created_by back queue and "my tickets" views.
--
-- CONCURRENTLY avoids locking these tables against writes while building.
-- Each such statement commits on its own and CANNOT run inside an explicit
-- transaction block - apply with `psql -f` as usual, do NOT wrap this file
-- in BEGIN/COMMIT.
--
-- NOT included here: a UNIQUE constraint on profiles.email. Unlike
-- username, email has never been constrained unique in this schema -
-- before adding one, confirm no duplicate emails already exist:
--   SELECT email, count(*) FROM profiles GROUP BY email HAVING count(*) > 1;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_email ON profiles (email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followups_agent_id ON followups (agent_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_callbacks_agent_id ON callbacks (agent_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_recipient_id ON notifications (recipient_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_assigned_to ON tickets (assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_created_by ON tickets (created_by);
