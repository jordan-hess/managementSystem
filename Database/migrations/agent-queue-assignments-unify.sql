-- Phase 2 (unified Tickets page) — agent_queue_assignments.queue now spans
-- BOTH T2's 4 queues and Social's 5 channels, the canonical "current queue"
-- vocabulary for the new self-service picker (setMyQueueAction). Casing is
-- deliberately preserved as-is per domain (T2 uppercase-with-spaces, Social
-- lowercase-single-token) rather than normalized — tickets.queue,
-- lib/t2/constants.ts's QUEUES, and every T2 UI already hardcode the
-- uppercase form; agent_queue_assignments.queue is a separate column that
-- only ever needs to be compared against a fixed list, never against
-- tickets.queue directly, so there's no functional reason to rename it.
ALTER TABLE agent_queue_assignments DROP CONSTRAINT IF EXISTS agent_queue_assignments_queue_check;
ALTER TABLE agent_queue_assignments ADD CONSTRAINT agent_queue_assignments_queue_check
  CHECK (queue IN (
    'ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING',
    'freescout', 'whatsapp', 'hellopeter', 'mybroadband', 'pissedcustomer'
  ));
