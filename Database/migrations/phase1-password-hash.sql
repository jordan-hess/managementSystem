-- Adds password_hash for the new Auth.js Credentials-based login.
-- Nullable: existing users have NULL until they set a new password via
-- /change-password (see the force_password_change migration in Task 11).
-- Run this once in the Supabase SQL Editor.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
