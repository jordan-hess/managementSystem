-- Removes the old coaching system entirely (tables + the SQL function that
-- backed its now-inert RLS policies) — replaced by coaching_actions
-- (see coaching-actions-schema.sql). Confirmed via repo-wide grep before
-- writing this: no other table has a foreign key into any of these four,
-- and coaching_can_manage() is used only by policies on these same four
-- tables — dropping it does not affect qa_assessments or warnings, whose
-- own RLS policies (also touched by the historical
-- qa-coaching-open-access.sql migration) are untouched here. Idempotent.

DROP TABLE IF EXISTS coaching_agent_checkins;
DROP TABLE IF EXISTS coaching_leader_checkins;
DROP TABLE IF EXISTS coaching_feedback;
DROP TABLE IF EXISTS coaching_weekly_stats;
DROP FUNCTION IF EXISTS coaching_can_manage(uuid);
