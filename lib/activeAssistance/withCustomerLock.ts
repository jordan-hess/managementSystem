import type { TransactionSql } from 'postgres'
import { withTransaction } from '@/lib/db/tx'

/**
 * Serializes "check active assistance, then create" for one customer across
 * every pod/connection sharing app_user. pg_advisory_xact_lock blocks
 * any concurrent caller using the same key until this transaction commits
 * or rolls back, then auto-releases — no separate unlock call needed.
 *
 * This is the only advisory-lock usage in the codebase (confirmed by audit:
 * no FOR UPDATE, no pg_advisory_lock anywhere else). hashtextextended's
 * fixed `0` seed is safe as long as it stays the only consumer of this key
 * space — if a second, unrelated feature ever needs its own advisory lock,
 * switch both to the two-int pg_advisory_xact_lock(classid, objid) form
 * with distinct classid constants instead of sharing this hash space.
 *
 * A hash collision here is never a correctness bug either way — worst case
 * it briefly, harmlessly serializes two *unrelated* customers' creates
 * against each other; the recheck inside the lock is what actually
 * enforces correctness, not the hash's uniqueness.
 */
export async function withCustomerLock<T>(
  customerId: string,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  return withTransaction(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${customerId}, 0))`
    return fn(tx)
  })
}
