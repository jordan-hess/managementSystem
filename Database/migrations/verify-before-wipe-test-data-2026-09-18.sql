-- READ-ONLY. Run and review before wipe-test-data-2026-09-18.sql, which
-- is a hard, irreversible TRUNCATE. Take a backup first regardless - see
-- CLAUDE.md's "Backup & Restore" section:
--   pg_dump "$DATABASE_URL" -f backups/opshub-dump-$(date +%Y%m%d-%H%M%S).sql
--
-- Scope: every customer/ticket/followup/callback and their full history,
-- announcements, notifications, password reset requests, agent kudos
-- ("testimonials"), leave/overtime requests, QA reviews/coaching/warnings,
-- and marked attendance. Does NOT touch teams, team_members, team_leaders,
-- shift_templates, team_rotations, roster_overrides, or any profile/
-- account data - roster structure and accounts are explicitly out of scope.

SELECT 'customers' AS table_name, count(*) FROM customers;
SELECT 'tickets (T2 Queue Hub)', count(*) FROM tickets;
SELECT 'ticket_escalations', count(*) FROM ticket_escalations;
SELECT 'ticket_events', count(*) FROM ticket_events;
SELECT 'attachments', count(*) FROM attachments;
SELECT 'ticket_solutions', count(*) FROM ticket_solutions;
SELECT 'ai_knowledge', count(*) FROM ai_knowledge;
SELECT 'scheduled_callbacks', count(*) FROM scheduled_callbacks;
SELECT 'followups', count(*) FROM followups;
SELECT 'callbacks', count(*) FROM callbacks;
SELECT 'support_tickets', count(*) FROM support_tickets;
SELECT 'support_ticket_status_history', count(*) FROM support_ticket_status_history;
SELECT 'followup_status_history', count(*) FROM followup_status_history;
SELECT 'ticket_activity_log', count(*) FROM ticket_activity_log;

SELECT 'management_posts', count(*) FROM management_posts;
SELECT 'management_post_reactions', count(*) FROM management_post_reactions;

SELECT 'notifications', count(*) FROM notifications;
SELECT 'password_reset_requests', count(*) FROM password_reset_requests;
SELECT 'agent_kudos (testimonials)', count(*) FROM agent_kudos;

SELECT 'requests (leave/overtime)', count(*) FROM requests;
SELECT 'leave_requests', count(*) FROM leave_requests;
SELECT 'overtime_requests', count(*) FROM overtime_requests;
SELECT 'overtime_entries', count(*) FROM overtime_entries;
SELECT 'request_approval_history', count(*) FROM request_approval_history;

SELECT 'qa_reviews', count(*) FROM qa_reviews;
SELECT 'qa_scores', count(*) FROM qa_scores;
SELECT 'qa_review_critical_failures', count(*) FROM qa_review_critical_failures;
SELECT 'qa_audit_log', count(*) FROM qa_audit_log;
SELECT 'coaching_actions', count(*) FROM coaching_actions;
SELECT 'warnings', count(*) FROM warnings;

SELECT 'attendance_records (the only roster-family table being touched)', count(*) FROM attendance_records;

-- Sanity check: nothing being wiped should hold the ONLY reference to a
-- config/structure table you're keeping. These should all still exist and
-- be non-empty after the wipe - confirm here that they're not somehow
-- also empty already for an unrelated reason.
SELECT 'teams (should be unaffected)', count(*) FROM teams;
SELECT 'team_members (should be unaffected)', count(*) FROM team_members;
SELECT 'shift_templates (should be unaffected)', count(*) FROM shift_templates;
SELECT 'team_rotations (should be unaffected)', count(*) FROM team_rotations;
SELECT 'roster_overrides (should be unaffected)', count(*) FROM roster_overrides;
SELECT 'case_categories (should be unaffected)', count(*) FROM case_categories;
SELECT 'qa_critical_failure_types (should be unaffected)', count(*) FROM qa_critical_failure_types;
SELECT 'qa_thresholds (should be unaffected)', count(*) FROM qa_thresholds;
SELECT 'profiles (should be unaffected)', count(*) FROM profiles;
