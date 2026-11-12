-- Adds Issue Type / Root Cause capture to support_tickets, mirroring T2's
-- tickets.issue_type/root_cause reporting shape — but captured at
-- resolution/close time (SupportTicketModal's resolved-status block), not
-- creation, so neither column can be NOT NULL at the DB level: a freshly
-- created or still-open ticket legitimately has both null. "Issue Type
-- required before a ticket can move to resolved/closed" is enforced in
-- app code only (validateStatusFields in app/(app)/support-tickets/actions.ts)
-- — same convention query_type already sets: the value lists live in
-- lib/tickets/constants.ts, not a CHECK constraint here. Apply by hand with
-- `psql -f` per CLAUDE.md's migration workflow (self-managed Postgres, not
-- Supabase — no CI runner).

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS issue_type text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS root_cause text;
