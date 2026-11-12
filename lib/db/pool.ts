import type postgres from 'postgres'
import type { PGlite } from '@electric-sql/pglite'
import { createLocalSql } from './local/sqlAdapter'

/**
 * The app's `sql` tagged template. In this copy it runs against an
 * in-process, in-memory Postgres (PGlite): no server, no connection string,
 * no credentials. The schema is built from Database/ on first use and seeded
 * with demo data (lib/db/local/bootstrap.ts); everything resets when the
 * server restarts.
 *
 * Typed as postgres.js's Sql so the existing call sites (sql<Row[]>`...`,
 * sql(list), sql.json, sql.begin) compile unchanged; lib/db/local/sqlAdapter.ts
 * implements that subset. `postgres` is a types-only import here.
 *
 * Cached on `globalThis` so `next dev`'s HMR doesn't rebuild the database
 * (and lose its data) on every file save.
 */

declare global {
  var __localDb: Promise<PGlite> | undefined
}

function getDb(): Promise<PGlite> {
  if (!globalThis.__localDb) {
    globalThis.__localDb = import('./local/bootstrap').then(m => m.createLocalDatabase())
    // Don't cache a failed build: let the next request retry.
    globalThis.__localDb.catch(() => { globalThis.__localDb = undefined })
  }
  return globalThis.__localDb
}

export const sql = createLocalSql(getDb) as unknown as ReturnType<typeof postgres>
