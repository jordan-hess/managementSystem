-- READ-ONLY. Run this and review the output BEFORE running the companion
-- file purge-deactivated-profiles-2026-09-17.sql, which is a hard,
-- irreversible DELETE. This file only ever SELECTs - it changes nothing.
--
-- This is the second such purge (see purge-deactivated-profiles-2026-09-08.sql
-- for the first, run 9 days earlier) - more accounts have presumably been
-- deactivated since. Claude has no database access and cannot run this or
-- see its output; a human must run it and review the "collateral" counts
-- below before deciding to proceed. Take a backup first regardless - see
-- CLAUDE.md's "Backup & Restore" section:
--   pg_dump "$DATABASE_URL" -f backups/opshub-dump-$(date +%Y%m%d-%H%M%S).sql
--
-- "Collateral" below means: a row whose OWN primary subject (the
-- still-active agent/team/customer/etc. the row is really about) is NOT
-- among the deactivated profiles, but some OTHER column on that same row
-- (who created it, reviewed it, was assigned it, etc.) IS - meaning the
-- purge script either deletes that row anyway (destroying it for the
-- still-active party) or nulls the offending column (keeping the row).
-- Check which of those two the purge script does for each table (its
-- comments say) and decide if you're comfortable with it before running.

CREATE TEMP TABLE deactivated_profiles AS
  SELECT id, full_name, email, role FROM profiles WHERE is_active = false;

SELECT count(*) AS deactivated_profile_count FROM deactivated_profiles;
SELECT id, full_name, email, role FROM deactivated_profiles ORDER BY role, full_name;

-- ── Straightforward deletes (row belongs entirely to a deactivated profile) ──
SELECT 'ticket_activity_log' AS table_name, count(*) FROM ticket_activity_log
  WHERE actor_id IN (SELECT id FROM deactivated_profiles)
     OR from_agent_id IN (SELECT id FROM deactivated_profiles)
     OR to_agent_id IN (SELECT id FROM deactivated_profiles);
SELECT 'notifications (sender/related)', count(*) FROM notifications
  WHERE sender_id IN (SELECT id FROM deactivated_profiles)
     OR related_profile_id IN (SELECT id FROM deactivated_profiles);
SELECT 'agent_kudos', count(*) FROM agent_kudos
  WHERE agent_id IN (SELECT id FROM deactivated_profiles) OR created_by IN (SELECT id FROM deactivated_profiles);
SELECT 'agent_queue_assignments', count(*) FROM agent_queue_assignments
  WHERE assigned_by IN (SELECT id FROM deactivated_profiles) OR user_id IN (SELECT id FROM deactivated_profiles);
SELECT 'queue_reassignments', count(*) FROM queue_reassignments
  WHERE changed_by IN (SELECT id FROM deactivated_profiles) OR user_id IN (SELECT id FROM deactivated_profiles);
SELECT 'management_post_reactions', count(*) FROM management_post_reactions
  WHERE profile_id IN (SELECT id FROM deactivated_profiles);
SELECT 'personal_notes', count(*) FROM personal_notes WHERE profile_id IN (SELECT id FROM deactivated_profiles);
SELECT 'warnings (issued_by)', count(*) FROM warnings WHERE issued_by IN (SELECT id FROM deactivated_profiles);
SELECT 'request_approval_history', count(*) FROM request_approval_history WHERE changed_by IN (SELECT id FROM deactivated_profiles);
SELECT 'followup_status_history', count(*) FROM followup_status_history WHERE changed_by IN (SELECT id FROM deactivated_profiles);
SELECT 'support_ticket_status_history', count(*) FROM support_ticket_status_history WHERE changed_by IN (SELECT id FROM deactivated_profiles);
SELECT 'qa_audit_log', count(*) FROM qa_audit_log WHERE actor_id IN (SELECT id FROM deactivated_profiles);

-- ── NEW this pass: management_posts (author_id) - deleting these CASCADES
-- away every reaction on that post, even from still-active reactors ──
SELECT 'management_posts (author_id)', count(*) FROM management_posts WHERE author_id IN (SELECT id FROM deactivated_profiles);
SELECT 'management_post_reactions on a post about to be deleted (collateral, includes still-active reactors)', count(*)
  FROM management_post_reactions mpr
  JOIN management_posts mp ON mp.id = mpr.post_id
  WHERE mp.author_id IN (SELECT id FROM deactivated_profiles)
    AND mpr.profile_id NOT IN (SELECT id FROM deactivated_profiles);

-- ── Collateral deletes: NOT NULL + no-cascade columns whose row can't be
-- kept, but whose "owner" column may point at a still-active profile ──
SELECT 'team_rotations created by a deactivated admin (collateral if for a still-active team)', count(*)
  FROM team_rotations WHERE created_by IN (SELECT id FROM deactivated_profiles);
SELECT 'attendance_records marked by a deactivated admin, for a still-active agent (collateral)', count(*)
  FROM attendance_records
  WHERE marked_by IN (SELECT id FROM deactivated_profiles)
    AND profile_id NOT IN (SELECT id FROM deactivated_profiles);
SELECT 'roster_overrides created by a deactivated admin, for a still-active agent (collateral) - NEW this pass', count(*)
  FROM roster_overrides
  WHERE created_by IN (SELECT id FROM deactivated_profiles)
    AND profile_id NOT IN (SELECT id FROM deactivated_profiles);
SELECT 'team_leaders assigned by a deactivated admin, still-active leader (collateral, loses leadership row) - NEW this pass', count(*)
  FROM team_leaders
  WHERE assigned_by IN (SELECT id FROM deactivated_profiles)
    AND profile_id NOT IN (SELECT id FROM deactivated_profiles);

-- ── qa_reviews and everything it cascades - check both sides ──
SELECT 'qa_reviews where agent is deactivated', count(*) FROM qa_reviews WHERE agent_id IN (SELECT id FROM deactivated_profiles);
SELECT 'qa_reviews where reviewer is deactivated but agent is still active (collateral - destroys a still-active agent''s review)', count(*)
  FROM qa_reviews
  WHERE reviewer_id IN (SELECT id FROM deactivated_profiles)
    AND agent_id NOT IN (SELECT id FROM deactivated_profiles);
SELECT 'coaching_actions (agent/created_by/completed_by/owner)', count(*) FROM coaching_actions
  WHERE agent_id IN (SELECT id FROM deactivated_profiles)
     OR created_by IN (SELECT id FROM deactivated_profiles)
     OR completed_by IN (SELECT id FROM deactivated_profiles)
     OR owner_id IN (SELECT id FROM deactivated_profiles);
SELECT 'followups (agent/created_by)', count(*) FROM followups
  WHERE agent_id IN (SELECT id FROM deactivated_profiles) OR created_by IN (SELECT id FROM deactivated_profiles);
SELECT 'support_tickets (agent/created_by)', count(*) FROM support_tickets
  WHERE agent_id IN (SELECT id FROM deactivated_profiles) OR created_by IN (SELECT id FROM deactivated_profiles);
SELECT 'callbacks (agent/created_by)', count(*) FROM callbacks
  WHERE agent_id IN (SELECT id FROM deactivated_profiles) OR created_by IN (SELECT id FROM deactivated_profiles);
SELECT 'tickets (T2 Queue Hub) (assigned_to/created_by)', count(*) FROM tickets
  WHERE assigned_to IN (SELECT id FROM deactivated_profiles) OR created_by IN (SELECT id FROM deactivated_profiles);

-- ── NEW this pass: nullable columns the purge script will UPDATE ... SET
-- NULL rather than delete the row for (customers/case_categories/
-- qa_thresholds/password_reset_requests/qa_review_critical_failures, and
-- the whole T2 Queue Hub ticket-detail subsystem) ──
SELECT 'customers.created_by (will be nulled, not deleted)', count(*) FROM customers WHERE created_by IN (SELECT id FROM deactivated_profiles);
SELECT 'case_categories.created_by (will be nulled)', count(*) FROM case_categories WHERE created_by IN (SELECT id FROM deactivated_profiles);
SELECT 'qa_thresholds.created_by (will be nulled)', count(*) FROM qa_thresholds WHERE created_by IN (SELECT id FROM deactivated_profiles);
SELECT 'password_reset_requests.reviewed_by (will be nulled)', count(*) FROM password_reset_requests WHERE reviewed_by IN (SELECT id FROM deactivated_profiles);
SELECT 'qa_review_critical_failures.created_by (will be nulled)', count(*) FROM qa_review_critical_failures WHERE created_by IN (SELECT id FROM deactivated_profiles);
SELECT 'ticket_escalations (created_by/t3_acknowledged_by/t3_response_by/t2_validated_by) (will be nulled)', count(*) FROM ticket_escalations
  WHERE created_by IN (SELECT id FROM deactivated_profiles)
     OR t3_acknowledged_by IN (SELECT id FROM deactivated_profiles)
     OR t3_response_by IN (SELECT id FROM deactivated_profiles)
     OR t2_validated_by IN (SELECT id FROM deactivated_profiles);
SELECT 'ticket_events.user_id (will be nulled)', count(*) FROM ticket_events WHERE user_id IN (SELECT id FROM deactivated_profiles);
SELECT 'attachments.uploaded_by (will be nulled)', count(*) FROM attachments WHERE uploaded_by IN (SELECT id FROM deactivated_profiles);
SELECT 'ticket_solutions (agent_id/reviewed_by) (will be nulled)', count(*) FROM ticket_solutions
  WHERE agent_id IN (SELECT id FROM deactivated_profiles) OR reviewed_by IN (SELECT id FROM deactivated_profiles);
SELECT 'custom_options.created_by (will be nulled)', count(*) FROM custom_options WHERE created_by IN (SELECT id FROM deactivated_profiles);
SELECT 'scheduled_callbacks (created_by/assigned_to) (will be nulled)', count(*) FROM scheduled_callbacks
  WHERE created_by IN (SELECT id FROM deactivated_profiles) OR assigned_to IN (SELECT id FROM deactivated_profiles);

-- ── Everything below is ON DELETE CASCADE from profiles(id) already -
-- the final `DELETE FROM profiles` in the purge script handles these on
-- its own, shown here only so the totals are visible before you commit ──
SELECT 'agent_login_log (cascades)', count(*) FROM agent_login_log WHERE profile_id IN (SELECT id FROM deactivated_profiles);
SELECT 'agent_status (cascades)', count(*) FROM agent_status WHERE user_id IN (SELECT id FROM deactivated_profiles);
SELECT 'team_members (cascades)', count(*) FROM team_members WHERE profile_id IN (SELECT id FROM deactivated_profiles);
SELECT 'team_leaders.profile_id (cascades)', count(*) FROM team_leaders WHERE profile_id IN (SELECT id FROM deactivated_profiles);
SELECT 'requests + children (cascades)', count(*) FROM requests WHERE profile_id IN (SELECT id FROM deactivated_profiles);
SELECT 'roster_overrides.profile_id (cascades)', count(*) FROM roster_overrides WHERE profile_id IN (SELECT id FROM deactivated_profiles);
SELECT 'password_reset_requests.profile_id (cascades, and its notifications with it)', count(*) FROM password_reset_requests WHERE profile_id IN (SELECT id FROM deactivated_profiles);
SELECT 'warnings.issued_to (cascades)', count(*) FROM warnings WHERE issued_to IN (SELECT id FROM deactivated_profiles);
SELECT 'notifications.recipient_id (cascades)', count(*) FROM notifications WHERE recipient_id IN (SELECT id FROM deactivated_profiles);
SELECT 'roster_positions.profile_id (SET NULL, not cascade)', count(*) FROM roster_positions WHERE profile_id IN (SELECT id FROM deactivated_profiles);
SELECT 'roster_position_assignments.profile_id (SET NULL, not cascade)', count(*) FROM roster_position_assignments WHERE profile_id IN (SELECT id FROM deactivated_profiles);
