// Pure write primitive - relocated pattern, mirrors lib/queues/assignments.ts's
// upsertAssignmentWithAudit exactly: every Active/On Break/In a Meeting/
// Inactive change (self-service, shift-end auto-inactive, or the
// reset-to-active on a fresh day's first login) funnels through this one
// function, so every movement lands in agent_status_history the same way
// regardless of who or what triggered it.

import { sql } from '@/lib/db/pool'
import { AgentStatusValue } from './constants'

export async function setAgentStatusWithAudit(
  tx: typeof sql, userId: string, status: AgentStatusValue, changedBy: string | null,
): Promise<void> {
  const [existing] = await tx<{ status: AgentStatusValue }[]>`
    SELECT status FROM agent_status WHERE user_id = ${userId}
  `
  await tx`
    INSERT INTO agent_status (user_id, status, updated_at) VALUES (${userId}, ${status}, now())
    ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
  `
  await tx`
    INSERT INTO agent_status_history (user_id, previous_status, new_status, changed_by)
    VALUES (${userId}, ${existing?.status ?? null}, ${status}, ${changedBy})
  `
}
