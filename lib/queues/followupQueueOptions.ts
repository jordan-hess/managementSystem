// Department-scoped queue/channel options for the standalone follow-up and
// callback modals (components/tickets/FollowupModal.tsx, CallbackModal.tsx)
// — neither table has a queue/channel column derived from an existing
// ticket (both are always created standalone, see those files' own header
// comments), so the agent picks one explicitly, scoped to what's relevant
// to their own department:
//   - Billing: Billing's escalation channels only (BILLING_CHANNELS).
//   - T2: just their own currently-active queue (getActiveQueue — the same
//     self-set "my current queue" value MyQueueWidget.tsx already drives),
//     falling back to all 4 T2 queues if they haven't set one today.
//   - Social (the default/fallback department): T2's queues plus every
//     Social channel, both the reportable ones (SOCIAL_QUEUES) and the
//     assignment-only "other channels" (EXTENDED_QUEUES) — everything
//     except Billing.

import { getAgentDepartment, type Department, type DepartmentProfile } from '@/lib/departments'
import { getActiveQueue } from '@/lib/t2/queues'
import { QUEUES } from '@/lib/t2/constants'
import { SOCIAL_QUEUES, EXTENDED_QUEUES } from './constants'
import { BILLING_CHANNELS } from '@/lib/billing/constants'

/** Pure: given this agent's department and (for T2 only) their resolved active queue, the options to offer. */
export function resolveFollowupQueueOptions(department: Department, activeT2Queue: string | null): string[] {
  if (department === 'Billing') return [...BILLING_CHANNELS]
  if (department === 'T2') {
    // activeT2Queue is self-declared (MyQueueWidget), not enforced against
    // the agent's real team — only trust it if it's actually one of the 4
    // real T2 queues, else fall back to offering all 4.
    return activeT2Queue && (QUEUES as readonly string[]).includes(activeT2Queue) ? [activeT2Queue] : [...QUEUES]
  }
  return [...QUEUES, ...SOCIAL_QUEUES, ...EXTENDED_QUEUES]
}

/** IO: resolves this agent's department-scoped options, fetching today's active queue only when they're T2. */
export async function getFollowupQueueOptionsForAgent(userId: string, profile: DepartmentProfile): Promise<string[]> {
  const department = getAgentDepartment(profile)
  const activeQueue = department === 'T2' ? await getActiveQueue(userId, profile.t2_team ?? null) : null
  return resolveFollowupQueueOptions(department, activeQueue)
}
