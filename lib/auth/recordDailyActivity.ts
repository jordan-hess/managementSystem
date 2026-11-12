import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { setAgentStatusWithAudit } from '@/lib/agentStatus/statusHistory'
import { formatDateKey, getBusinessToday } from '@/lib/roster/calendarUtils'

/**
 * Records this user's first activity of the business day, once. Sessions
 * here use NextAuth's JWT strategy with the default 30-day lifetime, so
 * hooking the credentials authorize() check would miss most days for most
 * agents — their existing session usually just carries over. Calling this
 * from the shared authenticated layout instead catches the real first
 * page load of the day for every agent, regardless of session age.
 *
 * Verified rule (Database/migrations/agent-login-log.sql): INSERT allowed
 * if profile_id = current user — self-report, no role gate. `userId` must
 * always come from the server-side session (getCurrentUserId()), never a
 * client-supplied value.
 *
 * ON CONFLICT DO NOTHING so it's safe to call on every request — a no-op
 * past the first call each day. Errors are swallowed: this is a
 * best-effort side effect that must never block a page render.
 *
 * RETURNING lets us tell a genuinely fresh insert (first page load of a
 * new business day) apart from the no-op conflict case — on a fresh day,
 * also reset agent_status back to 'active', so a manual "On Break"/"In a
 * Meeting" set the day before doesn't silently survive overnight with no
 * way for anyone to notice (see lib/agentStatus/). That reset goes through
 * setAgentStatusWithAudit like every other status change, so it shows up
 * in agent_status_history too - changed_by = the same user, since logging
 * in is itself the "this was you" signal, no separate system actor needed.
 */
export async function recordDailyActivity(userId: string): Promise<void> {
  const loginDate = formatDateKey(getBusinessToday())
  try {
    const inserted = await sql<{ profile_id: string }[]>`
      INSERT INTO agent_login_log (profile_id, login_date, first_login_at)
      VALUES (${userId}, ${loginDate}, now())
      ON CONFLICT (profile_id, login_date) DO NOTHING
      RETURNING profile_id
    `
    if (inserted.length > 0) {
      await withTransaction((tx) => setAgentStatusWithAudit(tx as unknown as typeof sql, userId, 'active', userId))
    }
  } catch {
    // best-effort — a failure here should never break page rendering
  }
}
