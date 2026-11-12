-- Drops the profiles.id -> auth.users(id) foreign key. Phase 1 of the Auth.js migration
-- no longer creates Supabase Auth users; profiles.id is now a plain UUID generated
-- independently. The FK would reject every new profile insert otherwise.
-- profiles.id remains the primary key; only the cross-table reference to
-- Supabase's auth.users table is removed.
-- Run this once in the Supabase SQL Editor, after phase1-password-hash.sql.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
