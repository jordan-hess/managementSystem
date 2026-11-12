import { DEFAULT_DEMO_ROLE, getDemoRole, resolveDemoUserId } from './demoRole'

/**
 * Resolves the current user's id. This copy has no auth: it's the seeded
 * profile for the role picked in the role-select modal, or the default
 * role's profile before one is picked (lib/auth/demoRole.ts).
 *
 * Takes an optional, ignored argument for backward compatibility with call
 * sites still passing a Supabase client during the Postgres migration —
 * remove that argument at each call site as it's ported off Supabase.
 */
export async function getCurrentUserId(_unused?: unknown): Promise<string | null> {
  const role = (await getDemoRole()) ?? DEFAULT_DEMO_ROLE
  return resolveDemoUserId(role)
}
