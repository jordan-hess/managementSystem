-- Password reset request workflow

-- Track who needs a password reset and its approval state
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API routes use service role which bypasses RLS for INSERT/UPDATE

-- Flag to force a password change on next login (set when admin approves a reset)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT FALSE;