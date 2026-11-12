-- Restrict each user to ONE reaction per announcement (post), not one
-- reaction per (post, emoji) - previously a user could react with every
-- emoji on the same post at once. De-duplicates first (keeping each
-- user's most recent reaction per post) in case any already-conflicting
-- rows exist, then tightens the unique constraint from
-- (post_id, profile_id, emoji) to (post_id, profile_id).

DELETE FROM management_post_reactions a
USING management_post_reactions b
WHERE a.post_id = b.post_id
  AND a.profile_id = b.profile_id
  AND a.created_at < b.created_at;

ALTER TABLE management_post_reactions
  DROP CONSTRAINT IF EXISTS management_post_reactions_post_id_profile_id_emoji_key;
ALTER TABLE management_post_reactions
  ADD CONSTRAINT management_post_reactions_post_id_profile_id_key UNIQUE (post_id, profile_id);
