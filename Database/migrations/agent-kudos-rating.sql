-- Adds a 1-5 star rating to agent_kudos so the Home page recognition console
-- can display it as a customer testimonial. Idempotent — safe to re-run.

ALTER TABLE agent_kudos ADD COLUMN IF NOT EXISTS rating smallint NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5);
