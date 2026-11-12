-- Home page: management-only announcements board (text and/or image), visible to everyone.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS management_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES profiles(id),
  content text NOT NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_management_posts_created_at ON management_posts (created_at DESC);

-- Note: this file used to also create a Supabase Storage bucket
-- (storage.buckets) for post images — meaningless now that Supabase
-- Storage is gone (CLAUDE.md: the last consumer, ManagementPostBoard.tsx's
-- image upload, was disabled when the Supabase deps were dropped) and the
-- storage schema doesn't exist on this self-managed cluster at all.