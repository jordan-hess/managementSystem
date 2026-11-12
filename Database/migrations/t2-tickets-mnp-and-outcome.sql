-- T2 Queue Hub merge.
--
-- 1. Generalizes sim_swap_outcome -> outcome: it turns out every queue's
--    creation form ends in some notion of "Outcome" (Advanced: a fixed
--    dropdown incl. escalation team; SIM SWAP and MNP: free text) — one
--    column, reused across queues, rather than a near-duplicate per queue.
--    This is an informational/reporting field only (confirmed with the
--    user): it does not itself change the ticket's real status — the agent
--    still uses the existing escalate/solve/schedule-callback actions to
--    actually move a ticket through its lifecycle.
-- 2. Adds the MNP (Porting) queue's own field set — a nested form (port-in?
--    -> customer experiencing issues? -> issue type, or -> inquiry type ->
--    reversal reason). donor_isp is shared across every MNP branch;
--    station_ticket_number/msisdn already exist on tickets and are reused
--    as-is rather than duplicated per queue.
ALTER TABLE tickets RENAME COLUMN sim_swap_outcome TO outcome;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS port_in text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS port_customer_experiencing_issues text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS port_issue_type text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS port_inquiry_type text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS port_reversal_reason text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS donor_isp text;
