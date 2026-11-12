import { sql } from '@/lib/db/pool'

interface RateLimitOptions {
  maxAttempts: number
  windowMinutes: number
}

/**
 * Basic rate limiter for unauthenticated auth endpoints (login,
 * password-reset requests). Added 2026-09-16 (production-readiness audit,
 * finding H3) - there was previously no throttling anywhere on the auth
 * surface.
 *
 * There's no Redis in this deployment (see CLAUDE.md) and every pod shares
 * the same Postgres, so a small events table - not an in-process counter -
 * is what actually works across replicas. Every call records one attempt
 * regardless of outcome; callers check the return value *before* doing the
 * expensive/sensitive work (password verify, email lookup).
 *
 * Requires the `auth_rate_limit_events` table - see
 * Database/migrations/auth-rate-limiting-2026-09-16.sql.
 */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  { maxAttempts, windowMinutes }: RateLimitOptions
): Promise<boolean> {
  const normalized = identifier.toLowerCase().trim()

  // Opportunistic cleanup - cheap given the (scope, identifier, created_at)
  // index, and keeps the table from growing unbounded without needing a
  // separate cron job.
  await sql`
    DELETE FROM auth_rate_limit_events
    WHERE scope = ${scope} AND created_at < now() - interval '1 day'
  `.catch((err) => console.error('checkRateLimit: cleanup failed', err))

  const [{ count }] = await sql<{ count: string }[]>`
    SELECT count(*) FROM auth_rate_limit_events
    WHERE scope = ${scope}
      AND identifier = ${normalized}
      AND created_at > now() - (${windowMinutes} * interval '1 minute')
  `

  if (Number(count) >= maxAttempts) return false

  await sql`
    INSERT INTO auth_rate_limit_events (scope, identifier) VALUES (${scope}, ${normalized})
  `

  return true
}
