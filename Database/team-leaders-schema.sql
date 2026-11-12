-- ============================================================
-- Team Leader Management System Migration
-- Run this in the Supabase SQL Editor after requests-schema.sql
-- Safe to run on a live database — all changes are additive.
-- ============================================================


-- ─── 1. team_leaders table ───────────────────────────────────────────────────
-- One leader per team (UNIQUE on team_id).
-- An admin can lead multiple teams (multiple rows with same profile_id).

CREATE TABLE team_leaders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  profile_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by uuid        NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id)
);

CREATE INDEX idx_team_leaders_team_id    ON team_leaders (team_id);
CREATE INDEX idx_team_leaders_profile_id ON team_leaders (profile_id);


-- ─── 2. Enforce team leader must be an admin (trigger) ───────────────────────
-- CHECK constraints cannot query other tables in Postgres.
-- A BEFORE trigger is the correct solution.

CREATE OR REPLACE FUNCTION enforce_team_leader_is_admin()
RETURNS TRIGGER AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = NEW.profile_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'enforce_team_leader_is_admin: profile % does not exist', NEW.profile_id;
  END IF;

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'enforce_team_leader_is_admin: profile % has role %, must be admin', NEW.profile_id, v_role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_enforce_team_leader_is_admin
  BEFORE INSERT OR UPDATE ON team_leaders
  FOR EACH ROW EXECUTE FUNCTION enforce_team_leader_is_admin();


-- ─── 3. request_approval_history table ───────────────────────────────────────
-- Immutable audit log. No UPDATE or DELETE policies are granted.

CREATE TABLE request_approval_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  changed_by   uuid        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  from_status  text        NOT NULL,
  to_status    text        NOT NULL,
  comment      text,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_history_request_id ON request_approval_history (request_id);
CREATE INDEX idx_approval_history_changed_by ON request_approval_history (changed_by);
CREATE INDEX idx_approval_history_changed_at ON request_approval_history (changed_at);


-- ─── 4. Extend notifications table ───────────────────────────────────────────
-- Add nullable request_id column; extend type CHECK to include 'request'.

ALTER TABLE notifications
  ADD COLUMN request_id uuid REFERENCES requests(id) ON DELETE CASCADE;

CREATE INDEX idx_notifications_request_id ON notifications (request_id);

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('info', 'followup', 'escalation', 'reminder', 'request'));


-- ─── 5. Auto-notify team leader on request insert ────────────────────────────

CREATE OR REPLACE FUNCTION notify_team_leader_on_request()
RETURNS TRIGGER AS $$
DECLARE
  v_leader_id      uuid;
  v_requester_name text;
  v_type_label     text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF NEW.team_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT tl.profile_id
      INTO v_leader_id
      FROM team_leaders tl
     WHERE tl.team_id = NEW.team_id
     LIMIT 1;

    IF v_leader_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF v_leader_id = NEW.profile_id THEN
      RETURN NEW;
    END IF;

    SELECT full_name INTO v_requester_name
      FROM profiles WHERE id = NEW.profile_id;

    v_type_label := CASE NEW.type
      WHEN 'leave'    THEN 'leave'
      WHEN 'overtime' THEN 'overtime'
      ELSE NEW.type
    END;

    INSERT INTO notifications (
      recipient_id, sender_id, request_id, title, message, type
    ) VALUES (
      v_leader_id,
      NEW.profile_id,
      NEW.id,
      'New ' || v_type_label || ' request',
      COALESCE(v_requester_name, 'An agent') || ' has submitted a ' || v_type_label || ' request requiring your review.',
      'request'
    );

  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_notify_team_leader_on_request
  AFTER INSERT ON requests
  FOR EACH ROW EXECUTE FUNCTION notify_team_leader_on_request();


-- ─── 6. Helper function: is_team_leader_for(team_id) ─────────────────────────
-- Used in RLS policies to avoid repeating the subquery.

CREATE OR REPLACE FUNCTION is_team_leader_for(p_team_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_leaders
    WHERE team_id = p_team_id
      AND profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ─── End of migration ─────────────────────────────────────────────────────────
