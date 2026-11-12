-- Query type dropdown for the Social "Add Ticket" modal — the list itself
-- lives in lib/tickets/constants.ts's SOCIAL_QUERY_TYPES, not enforced by a
-- CHECK constraint here (same convention as this table's existing
-- escalation_destination/followup_notes columns: a fixed dropdown in the
-- UI, plain nullable text at rest). Nullable: existing tickets have no
-- query type and are not backfilled.

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS query_type text;
