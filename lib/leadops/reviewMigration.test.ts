import { readFileSync } from 'fs'
import path from 'path'

const MIGRATION = 'Database/migrations/leadops-performance-reviews-2026-10-10.sql'
/** The SQL with comments removed and whitespace collapsed, so assertions do not depend on formatting. */
const sql = () =>
  readFileSync(path.join(process.cwd(), MIGRATION), 'utf8')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')

describe('the Performance Reviews migration encodes the spec', () => {
  it('is one idempotent transaction creating both tables', () => {
    const s = sql()
    expect(s).toMatch(/^ ?BEGIN;/)
    expect(s).toMatch(/COMMIT; ?$/)
    expect(s).toContain('CREATE TABLE IF NOT EXISTS performance_reviews')
    expect(s).toContain('CREATE TABLE IF NOT EXISTS review_events')
  })

  it('keeps one review per team leader per month, and only first-of-month dates', () => {
    const s = sql()
    expect(s).toContain('UNIQUE (tl_id, period)')
    expect(s).toContain('CHECK (EXTRACT(DAY FROM period) = 1)')
  })

  it('RESTRICTs the team leader and SETs NULL on every person who acted, with names stored beside them', () => {
    const s = sql()
    expect(s).toContain('tl_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT')
    for (const col of ['created_by', 'last_edited_by', 'shared_by', 'actor_id']) {
      expect(s).toContain(`${col} uuid REFERENCES profiles(id) ON DELETE SET NULL`)
    }
    for (const col of ['tl_name', 'created_by_name', 'last_edited_by_name', 'actor_name']) {
      expect(s).toMatch(new RegExp(`${col} text NOT NULL CHECK \\(btrim\\(${col}\\) <> ''\\)`))
    }
    expect(s).toContain('shared_by_name text')
  })

  it('limits the text columns', () => {
    const s = sql()
    expect(s).toContain('char_length(notes) <= 8000')
    expect(s).toContain('char_length(agreed_actions) <= 4000')
    expect(s).toContain('char_length(reason) <= 1000')
    expect(s).toContain('char_length(note) <= 1000')
  })

  it('requires a frozen share whenever a review is shared or acknowledged, and ties it to the same review', () => {
    const s = sql()
    expect(s).toContain("CHECK (status = 'draft' OR current_share_event_id IS NOT NULL)")
    expect(s).toContain('FOREIGN KEY (id, current_share_event_id) REFERENCES review_events (review_id, id) DEFERRABLE INITIALLY DEFERRED')
    expect(s).toContain('FOREIGN KEY (id, tl_viewed_event_id) REFERENCES review_events (review_id, id) DEFERRABLE INITIALLY DEFERRED')
    expect(s).toContain('UNIQUE (review_id, id)')
  })

  it('allows only the legal transitions, each written NULL-safe (no branch can pass on a NULL)', () => {
    const s = sql()
    const start = s.indexOf('review_events_legal_transition')
    const block = s.slice(start, s.indexOf('CONSTRAINT', start + 10))
    expect(block).toContain("(from_status IS NULL AND to_status = 'draft')")
    expect(block).toContain("(from_status IS NOT NULL AND from_status = 'draft' AND to_status = 'shared')")
    expect(block).toContain("(from_status IS NOT NULL AND from_status = 'shared' AND to_status = 'draft')")
    expect(block).toContain("(from_status IS NOT NULL AND from_status = 'shared' AND to_status = 'acknowledged')")
    expect(block).toContain("(from_status IS NOT NULL AND from_status = 'acknowledged' AND to_status = 'draft')")
    // Five branches, joined by four ORs: an extra (illegal) branch would add a fifth OR.
    expect(block.match(/OR \(/g)).toHaveLength(4)
  })

  it('names the sharer on every shared review, and a blank name does not count (NULL-safe)', () => {
    const s = sql()
    expect(s).toContain("CONSTRAINT performance_reviews_sharer_named CHECK (current_share_event_id IS NULL OR (shared_by_name IS NOT NULL AND btrim(shared_by_name) <> ''))")
  })

  it('keeps a stored snapshot version at 1 or more when there is one (NULL-safe)', () => {
    const s = sql()
    expect(s).toContain('CONSTRAINT review_events_snapshot_version_check CHECK (snapshot_version IS NULL OR snapshot_version >= 1)')
  })

  it('requires a reason on a reopen (NULL-safe), keeps the comment to acknowledgements, and copies on every share', () => {
    const s = sql()
    expect(s).toContain("CHECK (from_status IS DISTINCT FROM 'acknowledged' OR to_status <> 'draft' OR (reason IS NOT NULL AND btrim(reason) <> ''))")
    expect(s).toContain("CHECK (note IS NULL OR to_status = 'acknowledged')")
    expect(s).toContain("CHECK (to_status <> 'shared' OR (notes_copy IS NOT NULL AND actions_copy IS NOT NULL AND snapshot IS NOT NULL AND snapshot_version IS NOT NULL))")
  })

  it('makes review_events append-only, with exactly one exception: actor_id set from a value to NULL', () => {
    const s = sql()
    expect(s).toContain('CREATE OR REPLACE FUNCTION review_events_append_only()')
    expect(s).toContain("TG_OP = 'UPDATE' AND OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id')")
    expect(s).toContain("RAISE EXCEPTION 'review_events is append-only'")
    // The function has exactly one way to let a change through (RETURN NEW) and never returns OLD (which would let a DELETE through).
    const body = s.slice(s.indexOf('CREATE OR REPLACE FUNCTION review_events_append_only()'), s.indexOf('DROP TRIGGER IF EXISTS review_events_no_change'))
    expect(body.match(/RETURN NEW/g)).toHaveLength(1)
    expect(body).not.toContain('RETURN OLD')
    expect(s).toMatch(/BEFORE UPDATE OR DELETE ON review_events FOR EACH ROW/)
    expect(s).toMatch(/BEFORE TRUNCATE ON review_events FOR EACH STATEMENT/)
    expect(s).toContain('REVOKE ALL ON review_events FROM PUBLIC')
  })
})
