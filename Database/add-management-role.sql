-- Adds the 'management' role to profiles.role, alongside existing 'agent' and 'admin'.
-- Run this once in the Supabase SQL Editor.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('agent', 'admin', 'management'));
