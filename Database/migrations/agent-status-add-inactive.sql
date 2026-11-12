-- Adds a self-settable/auto-settable 'inactive' status alongside the
-- existing active/break/meeting — see lib/agentStatus/actions.ts's
-- applyShiftEndAutoInactive for the automatic (shift-end) transition, and
-- MyAgentStatusToggle.tsx for the manual one.

ALTER TABLE agent_status DROP CONSTRAINT IF EXISTS agent_status_status_check;
ALTER TABLE agent_status ADD CONSTRAINT agent_status_status_check
  CHECK (status IN ('active', 'break', 'meeting', 'inactive'));
