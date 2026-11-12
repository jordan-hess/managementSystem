-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'admin', 'management')),
  department TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  force_password_change BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers table
CREATE TABLE customers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  account_number TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Callbacks table
-- NOTE: customer_id is nullable and contact_name/contact_email/contact_phone exist since
-- migrations/callbacks-contact-details-2026-10-12.sql (a callback is a customer callback OR a manual one).
CREATE TABLE callbacks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES profiles(id) NOT NULL,
  created_by UUID REFERENCES profiles(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  query_description TEXT NOT NULL,
  possible_solution TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'rescheduled')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Follow-ups and escalations table
CREATE TABLE followups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES profiles(id) NOT NULL,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  type TEXT DEFAULT 'followup' CHECK (type IN ('followup', 'escalation')),
  query_description TEXT NOT NULL,
  possible_solution TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date TIMESTAMPTZ,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id),
  followup_id UUID REFERENCES followups(id) ON DELETE CASCADE,
  callback_id UUID REFERENCES callbacks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'followup', 'escalation', 'reminder', 'request', 'callback')),
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Password reset requests
CREATE TABLE password_reset_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Triggers to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER callbacks_updated_at BEFORE UPDATE ON callbacks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER followups_updated_at BEFORE UPDATE ON followups FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- set_updated_at() is the same helper under a different name, referenced
-- by roster-schema.sql and several later migrations (their own comments
-- say "already created by schema.sql", which was true on SIT's
-- Supabase-era database but was never actually defined in this file) —
-- defined here so a from-empty bootstrap has it before anything needs it.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Note: this file no longer includes the Supabase-Auth-era
-- handle_new_user()/on_auth_user_created trigger or Row Level Security
-- policies that used to live here. Both depended on Supabase's auth
-- schema and auth.uid() (auth.users signup trigger, authenticated-role
-- RLS policies) — meaningless now that the app is auth.js/direct-Postgres
-- (see CLAUDE.md's "Data layer & auth" and "Authorization layers"
-- sections: RLS is fully retired, authorization lives in
-- lib/auth/authz.ts). Removed rather than left in commented-out, since an
-- append-only migrations directory means any future correction ships as
-- a new file, not an edit to this one.
