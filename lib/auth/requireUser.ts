import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from './getCurrentUserId'
import { Role } from '@/types'

export interface AuthedUser {
  userId: string
  role: Role
  t2Team: string | null
  fullName: string
  forcePasswordChange: boolean
}

/**
 * Shared "who is making this request" resolver — previously duplicated
 * (with slightly different field subsets) across app/(app)/t2/actions.ts,
 * app/(app)/support-tickets/actions.ts, and lib/activeAssistance/actions.ts.
 * This is the superset shape; callers that only need `userId`/`role` just
 * ignore the rest.
 *
 * Also checks is_active. Server Actions get this re-check "for free" via
 * proxy.ts's page-level gate (a Server Action POSTs to the same path as
 * the page it's bound to, which proxy.ts's matcher already covers) - this
 * is defense-in-depth for that case. For an app/api/*.ts Route Handler,
 * which proxy.ts explicitly does NOT gate, this is the ONLY is_active
 * re-check that exists - callers there should use requireUser() rather
 * than duplicating their own profiles query (2026-09-18 prod-readiness
 * follow-up: app/api/roster/month-data/route.ts had no is_active check at
 * all, because no shared helper enforced it and each route rolled its own).
 */
export async function requireUser(): Promise<AuthedUser | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Unauthorized' }
  const rows = await sql<{ role: Role; t2_team: string | null; full_name: string; is_active: boolean; force_password_change: boolean }[]>`
    SELECT role, t2_team, full_name, is_active, force_password_change FROM profiles WHERE id = ${userId}
  `
  const row = rows[0]
  if (!row || !row.is_active) return { error: 'Unauthorized' }
  return { userId, role: row.role, t2Team: row.t2_team, fullName: row.full_name, forcePasswordChange: row.force_password_change }
}

/**
 * Same as requireUser(), but also rejects a caller who still needs to set
 * a new password (force_password_change). proxy.ts already redirects such
 * a caller to /change-password before they can reach any PAGE these API
 * routes are called from, so in the normal UI flow this only matters
 * against a direct API call bypassing that - a script, a stale tab still
 * open from before the flag was set, etc. (2026-09-18 prod-readiness
 * follow-up - proxy.ts's force_password_change gate, like its is_active
 * gate, explicitly excludes app/api/*.ts Route Handlers).
 *
 * NEVER use this for a route a force-password-change caller must
 * legitimately still reach - currently only
 * app/api/profile/update/route.ts, the route that clears the flag in the
 * first place. That route should keep using requireUser() directly.
 */
export async function requireActiveUser(): Promise<AuthedUser | { error: string }> {
  const auth = await requireUser()
  if ('error' in auth) return auth
  if (auth.forcePasswordChange) return { error: 'Unauthorized' }
  return auth
}

/** Mirrors proxy.ts's isRestrictedT2Agent — a server action is its own request
 *  boundary and can't rely on page-level routing for defense (see lib/db/tx.ts's
 *  "authorization must be checked in app code" note). */
export function isRestrictedT2Agent(auth: Pick<AuthedUser, 'role' | 't2Team'>): boolean {
  return auth.role === 'agent' && !!auth.t2Team
}
