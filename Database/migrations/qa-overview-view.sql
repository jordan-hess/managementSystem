-- QA Management System — Overview support view: latest assessment per
-- agent per template. Idempotent — safe to re-run.
--
-- Note: this used to declare WITH (security_invoker = true), a Postgres 15+
-- option meaningless now that RLS is fully retired (CLAUDE.md: authorization
-- lives entirely in lib/auth/authz.ts) — dropped here rather than left in
-- non-functional, and it also failed outright on this cluster's older
-- Postgres version.

CREATE OR REPLACE VIEW qa_latest_assessment_per_template AS
SELECT DISTINCT ON (agent_id, template_id) *
FROM qa_assessments
ORDER BY agent_id, template_id, assessment_date DESC, created_at DESC;
