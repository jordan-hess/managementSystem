-- Management no longer gets an active notification when a team leader/admin
-- submits a leave/overtime request — they already see it passively in their
-- Pending Requests queue (restricted to Management/HOD only, per
-- teams-department-grouping-era visibility work) and can approve/deny from
-- there. notify_team_leader_on_request (the general agent -> team-leader
-- notification) is untouched and keeps firing as before.
-- Idempotent — safe to re-run.

DROP TRIGGER IF EXISTS trg_notify_management_on_team_leader_request ON requests;
DROP FUNCTION IF EXISTS notify_management_on_team_leader_request();
