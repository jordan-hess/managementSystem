import type { TransactionSql } from 'postgres'
import { sql } from './pool'

/**
 * Wraps a set of queries in a single Postgres transaction for atomicity
 * (e.g. an insert that must succeed-or-fail together with a related
 * notification insert). There is no role-switching or claims injection
 * here — every connection is the same shared `app_user`, so this is
 * purely a transaction boundary, not an authorization boundary.
 *
 * Authorization must be checked in app code BEFORE calling this (see
 * lib/auth/authz.ts) — nothing here enforces who is allowed to do what.
 */
export async function withTransaction<T>(
  fn: (tx: TransactionSql) => Promise<T>
): Promise<T> {
  return sql.begin(fn) as Promise<T>
}
