-- leadOps Performance Reviews — real tables, replacing in-memory sample data.
-- Spec: docs/superpowers/specs/2026-10-10-leadops-performance-reviews-design.md
--
--   performance_reviews   one row per team leader per month: the reviewer's notes and agreed actions, the status
--                         (draft / shared / acknowledged), a revision for stale-edit protection, who created /
--                         last edited / shared it (ids AND names), and a pointer to the latest frozen share
--   review_events         append-only log of every status change; a share event also stores the frozen copies
--                         (notes, agreed actions, the figures snapshot); an acknowledge event stores the team
--                         leader's optional comment in its own column
--
-- Idempotent and transactional (idempotent is NOT the same as reversible: undoing it means dropping tables and
-- the history — see the runbook). No seed data. No RLS: authorisation lives in app code
-- (lib/leadops/reviewActions.ts). Apply on a database BEFORE deploying a build that contains the review screens.
--
-- Deletion: routine offboarding is a soft delete (profile deactivated), which touches nothing here. A HARD
-- delete of a team leader who has reviews is refused (tl_id is RESTRICT) until a purge deliberately deletes or
-- anonymises those reviews. Hard-deleting a person who ACTED on a review is never blocked: their id columns are
-- ON DELETE SET NULL and their NAME is stored beside every id.
--
-- Every CHECK is NULL-safe: a NULL comparison makes a CHECK pass, so nothing here relies on `=` against a
-- nullable column without IS NOT NULL / IS DISTINCT FROM.

BEGIN;

CREATE TABLE IF NOT EXISTS performance_reviews (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tl_id                  uuid        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  tl_name                text        NOT NULL CHECK (btrim(tl_name) <> ''),
  period                 date        NOT NULL CHECK (EXTRACT(DAY FROM period) = 1),
  status                 text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'shared', 'acknowledged')),
  notes                  text        CHECK (notes IS NULL OR char_length(notes) <= 8000),
  agreed_actions         text        CHECK (agreed_actions IS NULL OR char_length(agreed_actions) <= 4000),
  revision               integer     NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by             uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name        text        NOT NULL CHECK (btrim(created_by_name) <> ''),
  last_edited_by         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  last_edited_by_name    text        NOT NULL CHECK (btrim(last_edited_by_name) <> ''),
  shared_by              uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  shared_by_name         text,
  current_share_event_id uuid,
  tl_viewed_event_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tl_id, period),
  -- A shared or acknowledged review always has a frozen share (kept after an unshare/reopen so history reads correctly).
  CONSTRAINT performance_reviews_shared_needs_share CHECK (status = 'draft' OR current_share_event_id IS NOT NULL),
  CONSTRAINT performance_reviews_sharer_named CHECK (current_share_event_id IS NULL OR (shared_by_name IS NOT NULL AND btrim(shared_by_name) <> ''))
);

CREATE TABLE IF NOT EXISTS review_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id        uuid        NOT NULL REFERENCES performance_reviews(id) ON DELETE RESTRICT,
  from_status      text        CHECK (from_status IS NULL OR from_status IN ('draft', 'shared', 'acknowledged')),
  to_status        text        NOT NULL CHECK (to_status IN ('draft', 'shared', 'acknowledged')),
  actor_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name       text NOT NULL CHECK (btrim(actor_name) <> ''),
  reason           text        CHECK (reason IS NULL OR char_length(reason) <= 1000),
  note             text        CHECK (note IS NULL OR char_length(note) <= 1000),
  notes_copy       text,
  actions_copy     text,
  snapshot         jsonb,
  snapshot_version integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, id),
  CONSTRAINT review_events_legal_transition CHECK (
    (from_status IS NULL AND to_status = 'draft')
    OR (from_status IS NOT NULL AND from_status = 'draft' AND to_status = 'shared')
    OR (from_status IS NOT NULL AND from_status = 'shared' AND to_status = 'draft')
    OR (from_status IS NOT NULL AND from_status = 'shared' AND to_status = 'acknowledged')
    OR (from_status IS NOT NULL AND from_status = 'acknowledged' AND to_status = 'draft')
  ),
  CONSTRAINT review_events_reopen_reason CHECK (from_status IS DISTINCT FROM 'acknowledged' OR to_status <> 'draft' OR (reason IS NOT NULL AND btrim(reason) <> '')),
  CONSTRAINT review_events_note_only_on_ack CHECK (note IS NULL OR to_status = 'acknowledged'),
  CONSTRAINT review_events_share_copy CHECK (to_status <> 'shared' OR (notes_copy IS NOT NULL AND actions_copy IS NOT NULL AND snapshot IS NOT NULL AND snapshot_version IS NOT NULL)),
  CONSTRAINT review_events_snapshot_version_check CHECK (snapshot_version IS NULL OR snapshot_version >= 1)
);

-- The review and its events point at each other, so these foreign keys are added after both tables exist and
-- are DEFERRABLE INITIALLY DEFERRED: a share updates the review (with the new event's id) first and inserts the
-- event in the same transaction; the keys are checked at commit. The composite key ties the event to THIS review.
ALTER TABLE performance_reviews DROP CONSTRAINT IF EXISTS performance_reviews_current_share_fkey;
ALTER TABLE performance_reviews ADD CONSTRAINT performance_reviews_current_share_fkey
  FOREIGN KEY (id, current_share_event_id) REFERENCES review_events (review_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE performance_reviews DROP CONSTRAINT IF EXISTS performance_reviews_tl_viewed_fkey;
ALTER TABLE performance_reviews ADD CONSTRAINT performance_reviews_tl_viewed_fkey
  FOREIGN KEY (id, tl_viewed_event_id) REFERENCES review_events (review_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS review_events_review_idx ON review_events (review_id, created_at);

-- Append-only. The ONE exception: `ON DELETE SET NULL` on actor_id is itself an UPDATE, so exactly the update that
-- sets actor_id from a value to NULL with every other column unchanged is let through; every other UPDATE, and
-- every DELETE and TRUNCATE, is refused. (The application's database role owns the table, so this protects
-- against accidents and application paths — it is not tamper-proof against someone with equivalent privileges.)
CREATE OR REPLACE FUNCTION review_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'review_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS review_events_no_change ON review_events;
CREATE TRIGGER review_events_no_change
  BEFORE UPDATE OR DELETE ON review_events FOR EACH ROW EXECUTE PROCEDURE review_events_append_only();

DROP TRIGGER IF EXISTS review_events_no_truncate ON review_events;
CREATE TRIGGER review_events_no_truncate
  BEFORE TRUNCATE ON review_events FOR EACH STATEMENT EXECUTE PROCEDURE review_events_append_only();

REVOKE ALL ON review_events FROM PUBLIC;

COMMIT;
