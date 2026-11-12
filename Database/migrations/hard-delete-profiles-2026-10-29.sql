-- Makes `DELETE FROM profiles WHERE id = ...` succeed, so the Team Management
-- "Delete account" button (deleteUserAccount in app/(app)/team-leaders/
-- actions.ts) can remove an account outright instead of scrubbing and
-- deactivating it. Shared history (QA reviews, tickets, follow-ups,
-- warnings issued, coaching actions, audit/status logs, leadOps scorecards,
-- ...) is KEPT and anonymised: its reference to the deleted profile becomes
-- NULL and the app renders it as "Deleted user".
--
-- Rules, applied to every foreign key that references profiles(id):
--   - Already ON DELETE CASCADE / SET NULL: left alone. These were
--     deliberate per-table decisions (team_members, attendance_records,
--     requests, notifications.recipient_id, warnings.issued_to, ...).
--   - ON DELETE RESTRICT / NO ACTION (the ones that block the delete today):
--       * the purely personal columns listed in personal_cols below, plus
--         any column that is part of its table's primary key -> CASCADE
--       * everything else -> DROP NOT NULL, then ON DELETE SET NULL
--     As of SIT on 2026-10-29 the primary-key case is the leadOps per-person
--     tables manager_weekly_log, manager_kpa_ratings, tl_team_sizes and
--     weekly_manual_logs - deleting a TL/manager deletes those rows (agreed:
--     they mean nothing without the person). Their performance_reviews,
--     efficiency_scores and daily_activity_logs are kept (tl_id -> NULL).
-- The FKs are discovered from pg_constraint at run time rather than listed
-- by hand, so a column added by a migration this file doesn't know about
-- is still covered.
--
-- Two CHECK constraints required a profile column to be non-null and would
-- reject the SET NULL; they are relaxed to keep their timestamp half only:
--   - coaching_actions:  completed  <=> completed_at AND completed_by set
--   - efficiency_scores: verified   =>  verified_by AND verified_at set
--
-- Triggers that see the SET NULL updates and were checked for compatibility:
-- review_events_append_only (explicitly allows an actor_id -> NULL update),
-- trg_warnings_prevent_retarget (issued_to is CASCADE, never nulled),
-- trg_enforce_team_leader_is_admin (fires on a team_leaders.assigned_by
-- -> NULL update; passes as long as the row's leader still holds the admin/
-- team_leader role, which the app guarantees).
--
-- Takes ACCESS EXCLUSIVE locks on every referencing table while it rewrites
-- constraints - run outside business hours. Safe to re-run: on a second run
-- no RESTRICT/NO ACTION FKs remain, and the CHECK replacements are guarded.

BEGIN;

DO $$
DECLARE
  personal_cols text[] := ARRAY[
    'personal_notes.profile_id',
    'management_post_reactions.profile_id',
    'agent_queue_assignments.user_id',
    'agent_kudos.agent_id'
  ];
  fk record;
  col text;
  tbl_name text;
  action text;
BEGIN
  FOR fk IN
    SELECT c.conname, c.conrelid, c.conkey, c.condeferrable, c.condeferred
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
      AND c.confdeltype IN ('a', 'r')
  LOOP
    IF array_length(fk.conkey, 1) <> 1 THEN
      RAISE EXCEPTION 'hard-delete-profiles: % on % is a multi-column FK - handle by hand', fk.conname, fk.conrelid::regclass;
    END IF;

    SELECT a.attname INTO col FROM pg_attribute a WHERE a.attrelid = fk.conrelid AND a.attnum = fk.conkey[1];
    SELECT relname INTO tbl_name FROM pg_class WHERE oid = fk.conrelid;

    IF (tbl_name || '.' || col) = ANY (personal_cols)
       OR EXISTS (SELECT 1 FROM pg_constraint p WHERE p.conrelid = fk.conrelid AND p.contype = 'p' AND fk.conkey[1] = ANY (p.conkey))
    THEN
      action := 'CASCADE';
    ELSE
      action := 'SET NULL';
      EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', fk.conrelid::regclass, col);
    END IF;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.conrelid::regclass, fk.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES profiles(id) ON DELETE %s%s',
      fk.conrelid::regclass, fk.conname, col, action,
      CASE WHEN fk.condeferrable THEN ' DEFERRABLE INITIALLY ' || CASE WHEN fk.condeferred THEN 'DEFERRED' ELSE 'IMMEDIATE' END ELSE '' END
    );
    RAISE NOTICE 'hard-delete-profiles: %.% -> ON DELETE %', tbl_name, col, action;
  END LOOP;
END $$;

-- Relax the two CHECKs that pin a profile column to NOT NULL (both were
-- created unnamed, so they're found by definition rather than by name).
DO $$
DECLARE
  chk record;
BEGIN
  FOR chk IN
    SELECT conname, conrelid
    FROM pg_constraint
    WHERE contype = 'c'
      AND (
        (conrelid = 'public.coaching_actions'::regclass AND pg_get_constraintdef(oid) LIKE '%completed_by IS NOT NULL%')
        OR (conrelid = 'public.efficiency_scores'::regclass AND pg_get_constraintdef(oid) LIKE '%verified_by IS NOT NULL%')
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', chk.conrelid::regclass, chk.conname);
  END LOOP;
END $$;

ALTER TABLE coaching_actions DROP CONSTRAINT IF EXISTS coaching_actions_completed_check;
ALTER TABLE coaching_actions ADD CONSTRAINT coaching_actions_completed_check
  CHECK ((status = 'completed') = (completed_at IS NOT NULL));

ALTER TABLE efficiency_scores DROP CONSTRAINT IF EXISTS efficiency_scores_verified_check;
ALTER TABLE efficiency_scores ADD CONSTRAINT efficiency_scores_verified_check
  CHECK (status != 'verified' OR verified_at IS NOT NULL);

COMMIT;
