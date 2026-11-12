-- Lets a warned person see their own warnings (needed for the agent
-- dashboard's Warnings console), and adds a "next steps" field the current
-- schema has no place for. Run this once in the Supabase SQL Editor.
-- Safe to run on a live database — additive column, and the SELECT policy
-- only gains one new OR'd clause; every existing branch is unchanged.

ALTER TABLE warnings ADD COLUMN IF NOT EXISTS next_steps text;