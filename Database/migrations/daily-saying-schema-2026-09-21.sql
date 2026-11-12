-- daily_saying: a singleton row (id is always `true`), overwritten in place,
-- no history kept. Backing table for the home page's "Word of the Day"
-- widget (app/(app)/home/page.tsx, components/home/actions.ts). Never
-- captured anywhere in Database/ before now - it must have existed
-- implicitly on SIT (same class of gap as set_updated_at()/auth.uid(),
-- see Database/schema.sql and the PROD bootstrap runbook), discovered only
-- once a from-empty PROD bootstrap actually needed it.

CREATE TABLE IF NOT EXISTS daily_saying (
  id         boolean     PRIMARY KEY DEFAULT true CHECK (id = true),
  message    text        NOT NULL,
  author_id  uuid        NOT NULL REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
