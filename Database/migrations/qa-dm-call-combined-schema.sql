-- Holistic QA Platform — schema changes for the new "DM + Call (Combined
-- Case)" channel (dm_call_combined). Widens the channel CHECK constraints
-- used by qa_criteria/qa_rating_definitions/qa_reviews to accept the new
-- value, adds two qa_reviews columns for the channel's extra header fields
-- (Call ID / Reference, and an optional "call agent if different" note),
-- and adds two qa_scores columns (dm_rating/call_rating) to preserve the
-- two raw per-leg ratings this channel is scored with. qa_scores.rating
-- itself is widened from smallint to numeric(3,1) so it can hold the
-- averaged value (e.g. 3.5) computed from those two legs — the existing
-- `rating BETWEEN 0 AND 5` CHECK stays attached and valid across the type
-- change, no need to touch it. Apply by hand with `psql -f` per CLAUDE.md's
-- migration workflow (self-managed Postgres, not Supabase — no CI runner).
--
-- If any DROP CONSTRAINT below errors because the name doesn't match this
-- database's actual constraint name, find the real one first with:
--   SELECT conname FROM pg_constraint WHERE conrelid = '<table>'::regclass AND contype = 'c';

ALTER TABLE qa_criteria DROP CONSTRAINT IF EXISTS qa_criteria_channel_check;
ALTER TABLE qa_criteria ADD CONSTRAINT qa_criteria_channel_check
  CHECK (channel IN ('calls', 'social_media', 'tier2', 'dm_call_combined') OR channel IS NULL);

ALTER TABLE qa_rating_definitions DROP CONSTRAINT IF EXISTS qa_rating_definitions_channel_check;
ALTER TABLE qa_rating_definitions ADD CONSTRAINT qa_rating_definitions_channel_check
  CHECK (channel IN ('calls', 'social_media', 'tier2', 'dm_call_combined') OR channel IS NULL);

ALTER TABLE qa_reviews DROP CONSTRAINT IF EXISTS qa_reviews_channel_check;
ALTER TABLE qa_reviews ADD CONSTRAINT qa_reviews_channel_check
  CHECK (channel IN ('calls', 'social_media', 'tier2', 'dm_call_combined'));

ALTER TABLE qa_reviews DROP CONSTRAINT IF EXISTS qa_reviews_check;
ALTER TABLE qa_reviews ADD CONSTRAINT qa_reviews_check CHECK (
  (channel = 'calls' AND origin IS NULL)
  OR (channel = 'social_media' AND origin IN ('mybroadband', 'hellopeter', 'freescout', 'whatsapp', 'pissedconsumer', 'sprinkler'))
  OR (channel = 'tier2' AND origin IN ('advanced', 'sim_swap', 'voice', 'porting'))
  OR (channel = 'dm_call_combined' AND origin IN ('mybroadband', 'hellopeter', 'freescout', 'whatsapp', 'pissedconsumer', 'sprinkler'))
);

ALTER TABLE qa_reviews ADD COLUMN IF NOT EXISTS call_reference text;
ALTER TABLE qa_reviews ADD COLUMN IF NOT EXISTS secondary_agent_name text;

ALTER TABLE qa_scores ADD COLUMN IF NOT EXISTS dm_rating smallint CHECK (dm_rating BETWEEN 0 AND 5);
ALTER TABLE qa_scores ADD COLUMN IF NOT EXISTS call_rating smallint CHECK (call_rating BETWEEN 0 AND 5);
ALTER TABLE qa_scores ALTER COLUMN rating TYPE numeric(3,1) USING rating::numeric(3,1);
