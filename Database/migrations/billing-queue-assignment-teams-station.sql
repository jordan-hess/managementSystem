-- Widen agent_queue_assignments_queue_check to permit 'Teams' and
-- 'Station' as self-service "current queue" values for Billing agents
-- (MyQueueWidget.tsx / setMyQueueAction) — what they're currently working
-- FROM, not to be confused with BILLING_CHANNELS (Stitch/Peach Payments/
-- Pay@/Receivables), which is where a Billing ticket escalates TO. The
-- single 'BILLING' ticket-queue value stays excluded (see
-- lib/queues/constants.ts's ASSIGNABLE_QUEUES comment).
-- Idempotent — safe to re-run.

ALTER TABLE agent_queue_assignments DROP CONSTRAINT IF EXISTS agent_queue_assignments_queue_check;
ALTER TABLE agent_queue_assignments ADD CONSTRAINT agent_queue_assignments_queue_check
  CHECK (queue = ANY (ARRAY['ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING', 'freescout', 'whatsapp', 'hellopeter', 'mybroadband', 'pissedcustomer', 'Teams', 'Station']));
