-- Adds an optional queue/channel tag to follow-ups and callbacks, so one
-- created with no pre-existing ticket (the normal case — see
-- components/tickets/FollowupModal.tsx/CallbackModal.tsx's own header
-- comments: neither table has ever had a queue/channel column, and both
-- modals are only ever opened standalone) can still record which
-- queue/channel it relates to. Nullable — existing rows have none.
--
-- The allowed value set spans three previously-separate vocabularies (T2's
-- QUEUES, Social's SOCIAL_QUEUES + EXTENDED_QUEUES, and Billing's
-- BILLING_CHANNELS — see lib/t2/constants.ts, lib/queues/constants.ts,
-- lib/billing/constants.ts) rather than reusing any one table's narrower
-- CHECK, since which subset is OFFERED is scoped per agent department in
-- app code (app/(app)/tickets/page.tsx), not enforced per-department here.
-- Idempotent — safe to re-run.

ALTER TABLE followups ADD COLUMN IF NOT EXISTS queue text;
ALTER TABLE callbacks ADD COLUMN IF NOT EXISTS queue text;

ALTER TABLE followups DROP CONSTRAINT IF EXISTS followups_queue_check;
ALTER TABLE followups ADD CONSTRAINT followups_queue_check CHECK (queue IS NULL OR queue IN (
  'ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING',
  'freescout', 'whatsapp', 'hellopeter', 'mybroadband', 'pissedcustomer',
  'ICASA', 'ODU', 'TikTok', 'LinkedIn', 'TrustPilot', 'Reddit', 'Sprinklr', 'Dark posts',
  'Stitch', 'Peach Payments', 'Pay@', 'Receivables'
));

ALTER TABLE callbacks DROP CONSTRAINT IF EXISTS callbacks_queue_check;
ALTER TABLE callbacks ADD CONSTRAINT callbacks_queue_check CHECK (queue IS NULL OR queue IN (
  'ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING',
  'freescout', 'whatsapp', 'hellopeter', 'mybroadband', 'pissedcustomer',
  'ICASA', 'ODU', 'TikTok', 'LinkedIn', 'TrustPilot', 'Reddit', 'Sprinklr', 'Dark posts',
  'Stitch', 'Peach Payments', 'Pay@', 'Receivables'
));
