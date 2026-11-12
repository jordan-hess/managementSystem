-- Removes the old point-scored QA assessment system entirely (templates +
-- assessments + their RLS-era view/functions) — replaced by the Holistic QA
-- Platform (qa_reviews/qa_scores/etc., see qa-platform-schema.sql) and
-- coaching_actions (coaching-actions-schema.sql). Confirmed via repo-wide
-- audit before writing this: no other table has a foreign key into any of
-- these six, and qa_can_view_assessment/qa_can_edit_assessment are used only
-- by app code being removed alongside these tables (superseded by
-- qaCanViewAssessment/qaCanEditAssessment in lib/auth/authz.ts, themselves
-- also being removed). Backed up via pg_dump before this ran. Idempotent.

DROP VIEW IF EXISTS qa_latest_assessment_per_template;
DROP FUNCTION IF EXISTS qa_can_view_assessment(uuid);
DROP FUNCTION IF EXISTS qa_can_edit_assessment(uuid);
DROP TABLE IF EXISTS qa_assessment_scores;
DROP TABLE IF EXISTS qa_assessment_interactions;
DROP TABLE IF EXISTS qa_assessments;
DROP TABLE IF EXISTS qa_template_criteria;
DROP TABLE IF EXISTS qa_template_sections;
DROP TABLE IF EXISTS qa_templates;
