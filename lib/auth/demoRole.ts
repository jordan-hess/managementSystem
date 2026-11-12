import { cookies } from 'next/headers'
import { sql } from '@/lib/db/pool'
import type { Role } from '@/types'
import { DEMO_ROLE_COOKIE, isDemoRole } from './demoRoles'

/**
 * Who the request acts as. This copy has no auth: the role picked in the
 * role-select modal (a `demo_role` cookie) chooses a seeded profile from
 * the local in-memory database (Database/seeds/demo-role-profiles.sql).
 * Every page and action reads the role from `profiles` by id, so the
 * lib/auth/authz.ts checks apply unchanged.
 */

/** Used until the visitor picks a role (the modal stays open until they do). */
export const DEFAULT_DEMO_ROLE: Role = 'admin'

/** The role the visitor picked, or null if they haven't picked one yet. */
export async function getDemoRole(): Promise<Role | null> {
  try {
    const value = (await cookies()).get(DEMO_ROLE_COOKIE)?.value
    return isDemoRole(value) ? value : null
  } catch {
    // Outside a request scope (e.g. instrumentation's background sweep).
    return null
  }
}

/** First active profile with this role, preferring the seeded demo accounts. */
export async function resolveDemoUserId(role: Role): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM profiles
    WHERE role = ${role} AND is_active IS NOT FALSE
    ORDER BY (email LIKE 'demo.%@example.com') DESC, created_at
    LIMIT 1
  `
  return rows[0]?.id ?? null
}
