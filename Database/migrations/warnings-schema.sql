-- ============================================================
-- Warnings: team leaders issue verbal/written/final warnings to
-- their own team's agents; plain (non-leading) admins issue them
-- to any agent org-wide; management issues them to team leaders.
-- Reuses is_submitter_team_leader(profile_id), already live from
-- the management-requests-approval migration, to answer "is this
-- profile a team leader" for both the issuer and target side.
-- Run this in the Supabase SQL Editor.
-- Safe to run on a live database — additive only.
-- ============================================================

CREATE TABLE IF NOT EXISTS warnings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  issued_to   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  issued_by   uuid        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  type        text        NOT NULL CHECK (type IN ('verbal', 'written', 'final')),
  reason      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warnings_issued_to  ON warnings (issued_to);
CREATE INDEX IF NOT EXISTS idx_warnings_issued_by  ON warnings (issued_by);
CREATE INDEX IF NOT EXISTS idx_warnings_type       ON warnings (type);
CREATE INDEX IF NOT EXISTS idx_warnings_created_at ON warnings (created_at);

-- Reuse the set_updated_at() function already created by schema.sql
DROP TRIGGER IF EXISTS trg_warnings_updated_at ON warnings;
CREATE TRIGGER trg_warnings_updated_at
  BEFORE UPDATE ON warnings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enforce issued_to immutability after creation — RLS's WITH CHECK cannot
-- reference OLD, so this invariant (already enforced client-side by the
-- UI's disabled target field) needs a trigger, not a policy change.
CREATE OR REPLACE FUNCTION prevent_warning_retarget()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.issued_to IS DISTINCT FROM OLD.issued_to THEN
    RAISE EXCEPTION 'warnings.issued_to cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_warnings_prevent_retarget ON warnings;
CREATE TRIGGER trg_warnings_prevent_retarget
  BEFORE UPDATE ON warnings FOR EACH ROW EXECUTE FUNCTION prevent_warning_retarget();