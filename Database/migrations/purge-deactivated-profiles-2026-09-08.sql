-- One-time hard purge of every currently deactivated profile (is_active =
-- false) and all history tied to them, run against SIT on 2026-09-08 at the
-- user's explicit request/confirmation (including full knowledge that this
-- overrides the safer soft-delete pattern already used elsewhere in this
-- app — see deleteAccountAction in app/(app)/team-leaders/actions.ts, which
-- deliberately avoids a hard DELETE FROM profiles for exactly this reason).
--
-- Ordering matches the FK graph: rows that are NO ACTION/RESTRICT against
-- profiles(id) and aren't covered by a parent table's own ON DELETE CASCADE
-- are deleted explicitly, in dependency order, before the final
-- `DELETE FROM profiles`. Everything already ON DELETE CASCADE from
-- profiles(id) (agent_login_log, agent_status, attendance_records.profile_id,
-- notifications.recipient_id, password_reset_requests.profile_id,
-- requests.profile_id [+ its own children], roster_overrides.profile_id,
-- team_leaders.profile_id, team_members.profile_id, warnings.issued_to) is
-- left for that final DELETE to handle on its own.
--
-- Confirmed collateral damage to records NOT otherwise belonging to a
-- deactivated profile, accepted explicitly by the user because the
-- referencing column is NOT NULL and can't simply be cleared:
--   - 1 qa_reviews row for a still-active agent, reviewed by a since-
--     deactivated reviewer (cascades away its own coaching_actions/
--     qa_audit_log/qa_review_critical_failures/qa_scores).
--   - 15 team_rotations rows (shift-schedule weeks) created by a since-
--     deactivated admin.
--   - 2 attendance_records rows for still-active agents, marked by a
--     since-deactivated admin.
-- This file is not idempotent and is not meant to be re-run — it is a
-- point-in-time data purge, kept here per this repo's convention of
-- recording applied one-off SQL, not a repeatable schema migration.

BEGIN;

CREATE TEMP TABLE deactivated_profiles AS
  SELECT id FROM profiles WHERE is_active = false;

-- Direct-reference rows with no covering parent-table cascade.
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
-- to clear the reference. Confirmed acceptable collateral (see header).
DELETE FROM team_rotations
  WHERE created_by IN (SELECT id FROM deactivated_profiles);

DELETE FROM attendance_records
  WHERE marked_by IN (SELECT id FROM deactivated_profiles)
    AND profile_id NOT IN (SELECT id FROM deactivated_profiles);

-- QA reviews belonging to a deactivated agent, or reviewed by a deactivated
-- reviewer (the latter is the confirmed NOT NULL collateral case above).
-- Cascades coaching_actions/qa_audit_log/qa_review_critical_failures/qa_scores.
DELETE FROM qa_reviews
  WHERE agent_id IN (SELECT id FROM deactivated_profiles)
     OR reviewer_id IN (SELECT id FROM deactivated_profiles);

-- Redundant with the qa_reviews cascade above for rows tied to one of those
-- reviews; catches any coaching_actions stamped by a deactivated profile
-- that aren't tied to a deleted review at all.
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

DELETE FROM tickets
  WHERE assigned_to IN (SELECT id FROM deactivated_profiles)
     OR created_by IN (SELECT id FROM deactivated_profiles);

-- Finally, the profiles themselves — triggers every remaining ON DELETE
-- CASCADE column listed in the header comment.
DELETE FROM profiles
  WHERE id IN (SELECT id FROM deactivated_profiles);

COMMIT;
