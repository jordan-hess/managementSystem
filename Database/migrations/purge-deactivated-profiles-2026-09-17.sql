-- Second hard purge of every currently deactivated profile (is_active =
-- false) and all history tied to them - see
-- purge-deactivated-profiles-2026-09-08.sql for the first pass 9 days
-- earlier, and its header comment for why a hard DELETE is used here
-- instead of the safer soft-delete pattern elsewhere in this app
-- (deleteUserAccount in app/(app)/team-leaders/actions.ts).
--
-- RUN verify-before-purge-deactivated-profiles-2026-09-17.sql FIRST AND
-- REVIEW ITS OUTPUT, and take a backup, before running this file. Claude
-- has no database access and cannot run either file or see real row
-- counts - everything below is derived from static schema analysis, not
-- from live data. This file is not idempotent and is not meant to be
-- re-run.
--
-- The FK graph reachable from profiles(id) has grown substantially since
-- the 2026-09-08 pass (T2 Queue Hub, case_categories, qa_thresholds,
-- qa_review_critical_failures, management_posts, and two more columns on
-- tables already covered - roster_overrides.created_by and
-- team_leaders.assigned_by, distinct from those same tables' profile_id/
-- assigned_by columns which are already ON DELETE CASCADE). Everything
-- from the 2026-09-08 pass is repeated below unchanged; new steps are
-- marked NEW.
--
-- Two different strategies below, chosen per column:
--   - DELETE the row: only where the row's NOT NULL profile column can't
--     be nulled and the row has no meaningful life independent of that
--     profile (matches the original pass's own precedent for
--     team_rotations.created_by).
--   - UPDATE ... SET col = NULL: everywhere else, specifically because
--     deleting would either cascade into still-active parties' data
--     (customers.created_by cascades into callbacks/followups/
--     support_tickets/ticket_activity_log) or destroy real ticket-history
--     content (the T2 Queue Hub columns) that nothing in this purge's
--     scope treats as disposable.

BEGIN;

CREATE TEMP TABLE deactivated_profiles AS
  SELECT id FROM profiles WHERE is_active = false;

-- ── Direct-reference rows with no covering parent-table cascade (unchanged from 2026-09-08) ──
DELETE FROM ticket_activity_log
  WHERE actor_id IN (SELECT id FROM deactivated_profiles)
     OR from_agent_id IN (SELECT id FROM deactivated_profiles)
     OR to_agent_id IN (SELECT id FROM deactivated_profiles);

DELETE FROM notifications
  WHERE sender_id IN (SELECT id FROM deactivated_profiles)
     OR related_profile_id IN (SELECT id FROM deactivated_profiles);

DELETE FROM agent_kudos
  WHERE agent_id IN (SELECT id FROM deactivated_profiles)
     OR created_by IN (SELECT id FROM deactivated_profiles);

DELETE FROM agent_queue_assignments
  WHERE assigned_by IN (SELECT id FROM deactivated_profiles)
     OR user_id IN (SELECT id FROM deactivated_profiles);

DELETE FROM queue_reassignments
  WHERE changed_by IN (SELECT id FROM deactivated_profiles)
     OR user_id IN (SELECT id FROM deactivated_profiles);

-- NEW: management_posts authored by a deactivated profile - delete BEFORE
-- the reactions cleanup below, since this cascades away every reaction on
-- that post (management_post_reactions.post_id ON DELETE CASCADE),
-- including reactions from still-active profiles.
DELETE FROM management_posts
  WHERE author_id IN (SELECT id FROM deactivated_profiles);

DELETE FROM management_post_reactions
  WHERE profile_id IN (SELECT id FROM deactivated_profiles);

DELETE FROM personal_notes
  WHERE profile_id IN (SELECT id FROM deactivated_profiles);

DELETE FROM warnings
  WHERE issued_by IN (SELECT id FROM deactivated_profiles);

DELETE FROM request_approval_history
  WHERE changed_by IN (SELECT id FROM deactivated_profiles);

DELETE FROM followup_status_history
  WHERE changed_by IN (SELECT id FROM deactivated_profiles);

DELETE FROM support_ticket_status_history
  WHERE changed_by IN (SELECT id FROM deactivated_profiles);

DELETE FROM qa_audit_log
  WHERE actor_id IN (SELECT id FROM deactivated_profiles);

-- NOT NULL, no parent to cascade from — deleting the row is the only way
-- to clear the reference. Confirmed acceptable collateral in the
-- 2026-09-08 pass; re-verify counts for this pass via the companion file.
DELETE FROM team_rotations
  WHERE created_by IN (SELECT id FROM deactivated_profiles);

DELETE FROM attendance_records
  WHERE marked_by IN (SELECT id FROM deactivated_profiles)
    AND profile_id NOT IN (SELECT id FROM deactivated_profiles);

-- NEW: same NOT-NULL-no-cascade pattern as team_rotations.created_by and
-- attendance_records.marked_by above, on two columns that were missed on
-- 2026-09-08 (easy to miss: same table's profile_id/profile_id-equivalent
-- column is already ON DELETE CASCADE, but these are separate columns).
DELETE FROM roster_overrides
  WHERE created_by IN (SELECT id FROM deactivated_profiles)
    AND profile_id NOT IN (SELECT id FROM deactivated_profiles);

DELETE FROM team_leaders
  WHERE assigned_by IN (SELECT id FROM deactivated_profiles)
    AND profile_id NOT IN (SELECT id FROM deactivated_profiles);

-- QA reviews belonging to a deactivated agent, or reviewed by a deactivated
-- reviewer. Cascades coaching_actions/qa_audit_log/qa_review_critical_failures/qa_scores.
DELETE FROM qa_reviews
  WHERE agent_id IN (SELECT id FROM deactivated_profiles)
     OR reviewer_id IN (SELECT id FROM deactivated_profiles);

DELETE FROM coaching_actions
  WHERE agent_id IN (SELECT id FROM deactivated_profiles)
     OR created_by IN (SELECT id FROM deactivated_profiles)
     OR completed_by IN (SELECT id FROM deactivated_profiles)
     OR owner_id IN (SELECT id FROM deactivated_profiles);

-- Business-record "owner" tables — cascade their own children.
DELETE FROM followups
  WHERE agent_id IN (SELECT id FROM deactivated_profiles)
     OR created_by IN (SELECT id FROM deactivated_profiles);

DELETE FROM support_tickets
  WHERE agent_id IN (SELECT id FROM deactivated_profiles)
     OR created_by IN (SELECT id FROM deactivated_profiles);

DELETE FROM callbacks
  WHERE agent_id IN (SELECT id FROM deactivated_profiles)
     OR created_by IN (SELECT id FROM deactivated_profiles);

-- T2 Queue Hub tickets. Cascades ticket_escalations/ticket_events/
-- attachments/ticket_solutions/scheduled_callbacks for THESE tickets only
-- (their own profile-referencing columns, handled separately below, cover
-- the remaining rows whose parent ticket isn't itself being deleted).
DELETE FROM tickets
  WHERE assigned_to IN (SELECT id FROM deactivated_profiles)
     OR created_by IN (SELECT id FROM deactivated_profiles);

-- NEW: nullable RESTRICT columns, resolved by nulling rather than
-- deleting the row - deleting would cascade into or block against data
-- that doesn't belong to a deactivated profile at all.
--
-- customers.created_by: customers(id) is the CASCADE parent of
-- callbacks/followups/support_tickets/ticket_activity_log.customer_id and
-- the RESTRICT parent of tickets.customer_id - deleting a customer row
-- here would destroy or block on history for a still-active agent.
UPDATE customers SET created_by = NULL
  WHERE created_by IN (SELECT id FROM deactivated_profiles);

-- case_categories(id) is RESTRICT-referenced by followups.category_id -
-- deleting a still-used category would fail anyway; null the creator instead.
UPDATE case_categories SET created_by = NULL
  WHERE created_by IN (SELECT id FROM deactivated_profiles);

-- qa_thresholds(id) is SET-NULL-referenced by qa_reviews.outcome_band_id -
-- deleting the threshold would silently blank the scored band on
-- unrelated historical reviews; null the creator instead.
UPDATE qa_thresholds SET created_by = NULL
  WHERE created_by IN (SELECT id FROM deactivated_profiles);

-- The requester side (profile_id) cascades on the final profiles DELETE
-- below; this is only the reviewer side, which is independent of whether
-- the requester was also deactivated.
UPDATE password_reset_requests SET reviewed_by = NULL
  WHERE reviewed_by IN (SELECT id FROM deactivated_profiles);

-- Rows whose parent qa_reviews wasn't deleted above (neither the review's
-- agent nor reviewer is deactivated) but the critical-failure entry was
-- logged by a since-deactivated QA analyst.
UPDATE qa_review_critical_failures SET created_by = NULL
  WHERE created_by IN (SELECT id FROM deactivated_profiles);

-- T2 Queue Hub ticket-detail subsystem: real ticket content (escalation
-- notes, attachments, solutions, scheduled callbacks), not disposable
-- append-only logs - null the profile columns rather than delete rows.
UPDATE ticket_escalations SET
  created_by = CASE WHEN created_by IN (SELECT id FROM deactivated_profiles) THEN NULL ELSE created_by END,
  t3_acknowledged_by = CASE WHEN t3_acknowledged_by IN (SELECT id FROM deactivated_profiles) THEN NULL ELSE t3_acknowledged_by END,
  t3_response_by = CASE WHEN t3_response_by IN (SELECT id FROM deactivated_profiles) THEN NULL ELSE t3_response_by END,
  t2_validated_by = CASE WHEN t2_validated_by IN (SELECT id FROM deactivated_profiles) THEN NULL ELSE t2_validated_by END
WHERE created_by IN (SELECT id FROM deactivated_profiles)
   OR t3_acknowledged_by IN (SELECT id FROM deactivated_profiles)
   OR t3_response_by IN (SELECT id FROM deactivated_profiles)
   OR t2_validated_by IN (SELECT id FROM deactivated_profiles);

UPDATE ticket_events SET user_id = NULL
  WHERE user_id IN (SELECT id FROM deactivated_profiles);

UPDATE attachments SET uploaded_by = NULL
  WHERE uploaded_by IN (SELECT id FROM deactivated_profiles);

UPDATE ticket_solutions SET
  agent_id = CASE WHEN agent_id IN (SELECT id FROM deactivated_profiles) THEN NULL ELSE agent_id END,
  reviewed_by = CASE WHEN reviewed_by IN (SELECT id FROM deactivated_profiles) THEN NULL ELSE reviewed_by END
WHERE agent_id IN (SELECT id FROM deactivated_profiles)
   OR reviewed_by IN (SELECT id FROM deactivated_profiles);

UPDATE custom_options SET created_by = NULL
  WHERE created_by IN (SELECT id FROM deactivated_profiles);

UPDATE scheduled_callbacks SET
  created_by = CASE WHEN created_by IN (SELECT id FROM deactivated_profiles) THEN NULL ELSE created_by END,
  assigned_to = CASE WHEN assigned_to IN (SELECT id FROM deactivated_profiles) THEN NULL ELSE assigned_to END
WHERE created_by IN (SELECT id FROM deactivated_profiles)
   OR assigned_to IN (SELECT id FROM deactivated_profiles);

-- Finally, the profiles themselves — triggers every remaining ON DELETE
-- CASCADE column (agent_login_log, agent_status, attendance_records.profile_id,
-- notifications.recipient_id [and, transitively, any notification's
-- password_reset_request_id whose request just cascaded away],
-- password_reset_requests.profile_id, requests.profile_id [+ its own
-- children], roster_overrides.profile_id, team_leaders.profile_id,
-- team_members.profile_id, warnings.issued_to) plus the two ON DELETE SET
-- NULL columns (roster_positions.profile_id, roster_position_assignments.profile_id).
DELETE FROM profiles
  WHERE id IN (SELECT id FROM deactivated_profiles);

COMMIT;
