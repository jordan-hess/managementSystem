-- Adds the 'created_by' column to callbacks, for databases that predate this
-- addition to schema.sql (mirrors add-management-role.sql's role — a
-- catch-up patch for already-deployed databases). Run this once in the
-- Supabase SQL Editor.
--
-- Root cause: schema.sql defines callbacks.created_by, but this column was
-- never actually added to the live database, and no patch migration was
-- ever written for it (unlike the 'management' role). CallbackManager.tsx's
-- create flow inserts created_by, which fails with "Could not find the
-- 'created_by' column of 'callbacks' in the schema cache" until this runs.

ALTER TABLE callbacks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
