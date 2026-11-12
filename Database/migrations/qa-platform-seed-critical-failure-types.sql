-- Holistic QA Platform (Phase 1) — seeds the 6 named critical-failure types
-- from the spec. IMPORTANT: the auto_fail/caps_max_score/
-- requires_manager_review/requires_coaching values below are PROVISIONAL
-- CONFIGURATION, seeded for SIT testing only. They are NOT final business
-- rules — the business must explicitly confirm (or change) these consequence
-- settings before production go-live. There is no governance UI for this
-- table in Phase 1; edit via psql until one exists.
-- Idempotent.

INSERT INTO qa_critical_failure_types (name, description, auto_fail, caps_max_score, requires_manager_review, requires_coaching, sort_order) VALUES
  ('Security/authentication failure', 'Customer or account details discussed/actioned without proper verification.', true, NULL, true, true, 1),
  ('Compliance breach', 'A mandatory regulatory, contractual, or company-policy requirement was not followed.', true, NULL, true, true, 2),
  ('Incorrect customer information', 'The customer was given materially wrong information about their account, service, or billing.', true, NULL, true, false, 3),
  ('Privacy violation', 'Customer personal or account information was exposed or handled in a way that risks exposure.', true, NULL, true, true, 4),
  ('Incorrect technical action', 'A technical action was taken that was wrong for the situation (e.g. an incorrect network/account change).', false, 60, false, true, 5),
  ('Failure to follow mandatory process', 'A required step in the standard process was skipped or done out of order.', false, 60, false, true, 6)
ON CONFLICT (name) DO NOTHING;
