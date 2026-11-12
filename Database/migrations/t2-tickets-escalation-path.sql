-- T2 Queue Hub merge — Advanced queue's "Escalation Path" field (appears
-- right below the Queue selector on the creation form). Distinct from
-- ticket_escalations.escalate_to (the real T3-desk escalation destination,
-- set via the post-creation Escalate action) — this is an informational
-- classification captured at intake time, same spirit as the outcome field.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalation_path text;
