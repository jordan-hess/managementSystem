-- T2 Queue Hub merge, Phase 2. New tickets no longer get their number from
-- a SQLite AUTOINCREMENT id (T2-${40000 + id}) since ids are now uuids —
-- a dedicated sequence takes over numbering for every ticket created after
-- the merge. Started well above the highest migrated legacy number
-- (T2-40019 was the last real T2 ticket) to leave headroom and make it
-- obvious at a glance which tickets predate the merge.
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START WITH 40100;
