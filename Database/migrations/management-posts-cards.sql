-- Upgrades the Home page announcements console from plain text posts to cards:
-- adds a headline title and a category tag, plus a reactions table so anyone
-- can react to a post with a small fixed set of emoji. Idempotent — safe to re-run.

ALTER TABLE management_posts ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE management_posts ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'announcement' CHECK (category IN ('announcement', 'challenge', 'event', 'general'));

CREATE TABLE IF NOT EXISTS management_post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES management_posts(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id),
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, profile_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_management_post_reactions_post_id ON management_post_reactions (post_id);