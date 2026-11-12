// T2 Queue Hub merge — ported from t2-queue-hub/backend/src/utils/queues.js.
// Phase 2 (unified Tickets page) relocated the actual date-math/audit
// primitives to lib/queues/assignments.ts, now that "current queue" spans
// both T2 and Social — re-exported here so existing T2 call sites
// (app/(app)/t2/actions.ts, app/(app)/t2/page.tsx) don't need to change
// their imports. getActiveQueue stays here since its t2_team fallback is
// genuinely T2-specific.

import { sql } from '@/lib/db/pool'
import { QUEUES, TEAM_TO_QUEUE, type Queue } from './constants'
import { todayDate } from '@/lib/queues/assignments'

export { QUEUES, TEAM_TO_QUEUE, type Queue }
export { todayDate, mondayOf, weekDates } from '@/lib/queues/assignments'

// A profile's actual working queue on a given day (default: today), as set
// by their Team Lead or via the self-service "my current queue" picker.
// Falls back to their t2_team mapping (or raw t2_team) if they haven't been
// assigned that day yet. The fallback is only meaningful for "right now" —
// callers browsing history should not use this for past dates.
export async function getActiveQueue(
  userId: string,
  fallbackTeam: string | null,
  date?: string
): Promise<string | null> {
  const d = date || (await todayDate())
  const [row] = await sql<{ queue: string }[]>`
    SELECT queue FROM agent_queue_assignments WHERE user_id = ${userId} AND date = ${d}
  `
  if (row) return row.queue
  return (fallbackTeam && TEAM_TO_QUEUE[fallbackTeam]) || fallbackTeam || null
}
