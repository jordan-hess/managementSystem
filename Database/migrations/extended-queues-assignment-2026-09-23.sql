-- Adds 8 queues to the assignable set: ICASA, ODU, TikTok, LinkedIn,
-- TrustPilot, Reddit, Sprinklr and Dark posts.
--
-- Widens agent_queue_assignments_queue_check only. This is deliberate and
-- ASSIGNMENT-ONLY:
--
--   * agent_queue_assignments    -> widened here. A team lead can roster an
--                                   agent onto one of these on the Queue
--                                   Assignment page, and an agent can pick
--                                   one as their current queue.
--   * support_tickets.channel    -> NOT widened. No support ticket can be
--                                   raised in one of these queues yet, so
--                                   filtering /tickets by one returns an
--                                   empty list. That is the expected
--                                   behaviour of assignment-only, not a bug.
--
-- When these become real ticket channels, widening
-- support_tickets_channel_check is the follow-up - and at that point they
-- should probably also join lib/queues/constants.ts's SOCIAL_QUEUES so they
-- appear in the reporting Social channel summary.
--
-- Values keep the business's own casing ('TikTok', not 'tiktok'), matching
-- the rule stated at the top of lib/queues/constants.ts: each queue keeps
-- its native casing rather than being normalised. The list below must stay
-- in sync with ALL_QUEUES / EXTENDED_QUEUES in that file - lib/queues/
-- actions.ts validates against ASSIGNABLE_QUEUES before inserting, so a
-- value present in one and not the other either fails at the check
-- constraint or is silently rejected by the action.
--
-- Note 'Teams' and 'Station' are in the list below but are NOT queues in
-- the routing sense - they are the two places a Billing agent can be
-- working from (lib/billing/constants.ts's BILLING_AGENT_QUEUES, added by
-- billing-queue-assignment-teams-station.sql). They are carried over
-- unchanged.
--
-- Apply by hand, as with every file in this directory. DATABASE_URL lives
-- in .env.local and never reaches your shell, so export it first:
--   Git Bash:   export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env.local)"
--   PowerShell: $env:DATABASE_URL = ((Select-String -Path .env.local -Pattern '^DATABASE_URL=').Line -replace '^DATABASE_URL=','')
--   psql "$DATABASE_URL" -c "select current_database(), inet_server_addr();"
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f Database/migrations/extended-queues-assignment-2026-09-23.sql
--
-- Idempotent - drops and recreates the constraint with the full list.

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
    'ICASA', 'ODU', 'TikTok', 'LinkedIn', 'TrustPilot', 'Reddit', 'Sprinklr', 'Dark posts'
  ]::text[]));

-- Existing rows must still satisfy the new constraint. ADD CONSTRAINT
-- validates them, so a pre-existing out-of-list value would abort the
-- transaction rather than leave the table unconstrained - which is the
-- behaviour we want.

COMMIT;

-- Verify (expect the 8 new values present):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'agent_queue_assignments_queue_check';
