-- Drops daily_saying (created by daily-saying-schema-2026-09-21.sql). The
-- Home page's "Word of the Day" no longer reads or writes it - it now shows
-- an automatic quote of the day from lib/quotes.ts (feat/quote-of-the-day).
-- Nothing else references this table: no views, functions or other tables'
-- foreign keys (its only dependency is its own author_id FK to profiles).
--
-- Only run this once the quote-of-the-day release is deployed to the
-- environment in question - older builds still query daily_saying on every
-- Home page render.

DROP TABLE IF EXISTS daily_saying;
