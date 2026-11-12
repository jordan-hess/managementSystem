-- Adds the UNIQUE constraint on profiles.email flagged as missing by the
-- 2026-09-16 production-readiness audit (deferred there) and re-flagged by
-- the 2026-09-18 follow-up audit. Run
-- verify-before-profiles-email-unique-2026-09-18.sql FIRST and resolve any
-- exact duplicates it finds - this ALTER will fail outright if any remain.
--
-- Closes: (a) the TOCTOU race in app/api/admin/create-user/route.ts, whose
-- duplicate-email check is a plain SELECT-then-INSERT with no constraint
-- backing it - two concurrent requests for the same email could otherwise
-- both pass the check and insert duplicate accounts; (b) non-deterministic
-- login (lib/auth/config.ts's `WHERE email = ${normalized}` + `rows[0]`) if
-- a duplicate ever existed - whichever row happened to sort first would
-- silently receive the other's login attempts.
--
-- profiles.email is nullable (T2 username-only agents have none) -
-- standard SQL UNIQUE constraints allow any number of NULLs, so this
-- doesn't affect them.

ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
