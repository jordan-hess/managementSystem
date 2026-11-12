-- READ-ONLY. Run this BEFORE the companion migration
-- add-profiles-email-unique-2026-09-18.sql, which adds a UNIQUE constraint
-- on profiles.email. This file only ever SELECTs - it changes nothing.
--
-- profiles.email has never been constrained unique (see
-- add-missing-hot-path-indexes-2026-09-16.sql's comment) - login
-- (lib/auth/config.ts) looks it up with `WHERE email = ${normalized}` and
-- takes rows[0], so if a duplicate exists today, login is already
-- non-deterministic for that email (whichever row sorts first silently
-- wins). Two checks below, since login always lowercases the typed
-- identifier first (see the 2026-09-18 @opsHub casing incident):
--
-- 1. Exact duplicates (same string) - these would make ADD CONSTRAINT fail
--    outright.
-- 2. Case-insensitive duplicates (same email, different casing) - ADD
--    CONSTRAINT would NOT fail on these (Postgres UNIQUE is case-sensitive
--    by default), but the non-lowercase row becomes permanently
--    unreachable by login regardless, since every login attempt is
--    lowercased before the lookup - worth knowing about even though it
--    won't block the constraint.
--
-- profiles.email is nullable (T2 username-only agents have none) -
-- standard SQL UNIQUE constraints allow multiple NULLs, so T2 profiles
-- aren't a concern here and are excluded from these checks.

-- Exact duplicates - MUST be resolved before adding the constraint.
SELECT email, count(*), array_agg(id) AS profile_ids, array_agg(full_name) AS names, array_agg(is_active) AS active_flags
FROM profiles
WHERE email IS NOT NULL
GROUP BY email
HAVING count(*) > 1;

-- Case-insensitive duplicates (includes the exact ones above) - won't
-- block the constraint, but flags any email reachable-by-login only in
-- one casing while a sibling row with different casing sits orphaned.
SELECT lower(email) AS email_lower, count(*), array_agg(email) AS actual_values, array_agg(id) AS profile_ids, array_agg(full_name) AS names
FROM profiles
WHERE email IS NOT NULL
GROUP BY lower(email)
HAVING count(*) > 1;
