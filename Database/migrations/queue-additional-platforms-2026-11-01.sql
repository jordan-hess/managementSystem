-- Queue Board "additional platforms" - lets a team lead put an agent on up to
-- two extra platforms for a day on top of their main queue, and records which
-- kind of change a queue_reassignments row is.
--
-- 1. agent_queue_assignments_queue_check: widened with the combined value
--    'TrustPilot & LinkedIn'. The old 'TrustPilot' and 'LinkedIn' stay valid so
--    existing rows still satisfy the constraint; the picker just stops
--    offering them (lib/queues/constants.ts PICKER_EXTENDED_QUEUES).
-- 2. agent_additional_queues: the extra platforms an agent covers on a date,
--    one row per (user, date, queue). Same queue vocabulary as (1). Rows go
--    when the profile does (ON DELETE CASCADE); created_by is just audit.
-- 3. queue_reassignments.kind: 'main' (the existing behaviour, every current
--    row) or 'additional' (a change to the extra platforms).
--
-- Additive and re-runnable: only adds things (the constraints are dropped and
-- recreated with the full list). Apply on SIT and then PROD BEFORE deploying
-- the app code that uses it. Apply by hand, as with every file in this
-- directory:
--   Git Bash:   export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env.local)"
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f Database/migrations/queue-additional-platforms-2026-11-01.sql
--
-- The queue list below must stay in sync with ALL_QUEUES / ASSIGNABLE_QUEUES
-- in lib/queues/constants.ts. 'Teams' and 'Station' are Billing agent work
-- locations (BILLING_AGENT_QUEUES), carried over unchanged.

BEGIN;

ALTER TABLE agent_queue_assignments DROP CONSTRAINT IF EXISTS agent_queue_assignments_queue_check;

ALTER TABLE agent_queue_assignments ADD CONSTRAINT agent_queue_assignments_queue_check
  CHECK (queue = ANY (ARRAY[
    -- T2 routing queues (lib/t2/constants.ts QUEUES)
    'ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING',
    -- Social channels (lib/queues/constants.ts SOCIAL_QUEUES)
    'freescout', 'whatsapp', 'hellopeter', 'mybroadband', 'pissedcustomer',
    -- Billing agent work locations (lib/billing/constants.ts BILLING_AGENT_QUEUES)
    'Teams', 'Station',
    -- Added 2026-09-23 (lib/queues/constants.ts EXTENDED_QUEUES)
    'ICASA', 'ODU', 'TikTok', 'LinkedIn', 'TrustPilot', 'Reddit', 'Sprinklr', 'Dark posts',
    -- Added 2026-11-01 (TRUSTPILOT_LINKEDIN)
    'TrustPilot & LinkedIn'
  ]::text[]));

CREATE TABLE IF NOT EXISTS agent_additional_queues (
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date        text NOT NULL,  -- 'YYYY-MM-DD', same as agent_queue_assignments.date
  queue       text NOT NULL,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date, queue)
);

ALTER TABLE agent_additional_queues DROP CONSTRAINT IF EXISTS agent_additional_queues_queue_check;

ALTER TABLE agent_additional_queues ADD CONSTRAINT agent_additional_queues_queue_check
  CHECK (queue = ANY (ARRAY[
    'ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING',
    'freescout', 'whatsapp', 'hellopeter', 'mybroadband', 'pissedcustomer',
    'Teams', 'Station',
    'ICASA', 'ODU', 'TikTok', 'LinkedIn', 'TrustPilot', 'Reddit', 'Sprinklr', 'Dark posts',
    'TrustPilot & LinkedIn'
  ]::text[]));

CREATE INDEX IF NOT EXISTS idx_agent_additional_queues_date ON agent_additional_queues(date);

ALTER TABLE queue_reassignments ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'main';

ALTER TABLE queue_reassignments DROP CONSTRAINT IF EXISTS queue_reassignments_kind_check;

ALTER TABLE queue_reassignments ADD CONSTRAINT queue_reassignments_kind_check
  CHECK (kind IN ('main', 'additional'));

COMMIT;

-- Verify (expect 'TrustPilot & LinkedIn' in both, the table present, and
-- every existing queue_reassignments row as kind = 'main'):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname IN ('agent_queue_assignments_queue_check', 'agent_additional_queues_queue_check');
--   \d agent_additional_queues
--   SELECT kind, count(*) FROM queue_reassignments GROUP BY 1;
