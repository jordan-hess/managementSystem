-- Lets an agent leave optional feedback on their own QA review, surfaced on
-- the rebuilt My QA page (app/(app)/qa/page.tsx). One free-text field is
-- enough for this phase — no separate audit table, matching the "no
-- over-engineering" call on this feature. Idempotent.

ALTER TABLE qa_reviews ADD COLUMN IF NOT EXISTS agent_feedback text;
