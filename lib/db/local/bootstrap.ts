import fs from 'node:fs'
import path from 'node:path'
import { PGlite, types } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

/**
 * Builds the app's database in memory, in-process (PGlite = Postgres
 * compiled to WASM). Nothing connects anywhere: on first query this
 * replays Database/ into a fresh instance and seeds demo data. Data lives
 * until the server process restarts.
 *
 * Replay order (the repo has no migration manifest):
 *   1. Supabase shims (Database/local/00-shims.sql)
 *   2. schema.sql, then the other top-level Database/*.sql feature files
 *   3. undated migrations, alphabetically, retried until dependencies exist
 *   4. dated migrations (YYYY-MM[-DD] in the name), oldest first
 *   5. Database/local/overrides.sql (final-state fixes the replay can't infer)
 *   6. Database/seeds/*.sql and Database/local/seed-*.sql
 * Each file runs in its own transaction, so a failure leaves nothing half-applied.
 */

const DATABASE_DIR = path.join(process.cwd(), 'Database')

// One-off data scripts against the old live DB, not schema.
const SKIP = /^(wipe-|purge-|verify-before-|reset-.*passwords)/

const raw = (x: string) => x

function datedKey(file: string): string | null {
  return file.match(/(\d{4}-\d{2}(?:-\d{2})?)/)?.[1] ?? null
}

function readSql(rel: string): string {
  return fs
    .readFileSync(path.join(DATABASE_DIR, rel), 'utf8')
    // Each file is wrapped in our own transaction.
    .replace(/^\s*(BEGIN|COMMIT|START TRANSACTION)\s*;\s*$/gim, '')
    // Not allowed inside a transaction; meaningless on an empty in-memory DB anyway.
    .replace(/\bINDEX\s+CONCURRENTLY\b/gi, 'INDEX')
}

function listSql(dir: string): string[] {
  const full = path.join(DATABASE_DIR, dir)
  if (!fs.existsSync(full)) return []
  return fs.readdirSync(full).filter(f => f.endsWith('.sql')).sort().map(f => (dir ? `${dir}/${f}` : f))
}

async function runFile(db: PGlite, rel: string): Promise<string | null> {
  try {
    await db.exec(`BEGIN;\n${readSql(rel)}\n;COMMIT;`)
    return null
  } catch (e) {
    try { await db.exec('ROLLBACK') } catch { /* not in a transaction */ }
    return e instanceof Error ? e.message : String(e)
  }
}

export async function createLocalDatabase(): Promise<PGlite> {
  const started = Date.now()
  const db = await PGlite.create({
    extensions: { uuid_ossp, btree_gist, pgcrypto },
    // Match postgres.js as this app configured it (lib/db/pool.ts): dates and
    // timestamps stay raw strings, int8 stays a string.
    parsers: { [types.DATE]: raw, [types.TIMESTAMP]: raw, [types.TIMESTAMPTZ]: raw, [types.INT8]: raw },
  })

  const failures = new Map<string, string>()
  const apply = async (rel: string) => {
    const err = await runFile(db, rel)
    if (err) failures.set(rel, err)
    else failures.delete(rel)
    return !err
  }

  await db.exec(readSql('local/00-shims.sql'))

  for (const rel of ['schema.sql', ...listSql('').filter(f => f !== 'schema.sql')]) await apply(rel)

  const migrations = listSql('migrations').filter(f => !SKIP.test(path.basename(f)))
  let pending = migrations.filter(f => !datedKey(f))
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const stillFailing: string[] = []
    for (const rel of pending) if (!(await apply(rel))) stillFailing.push(rel)
    if (stillFailing.length === pending.length) break
    pending = stillFailing
  }
  const dated = migrations
    .filter(f => datedKey(f))
    .sort((a, b) => datedKey(a)!.localeCompare(datedKey(b)!) || a.localeCompare(b))
  for (const rel of dated) await apply(rel)

  // A dated migration can depend on an undated one that needed it first.
  for (const rel of [...failures.keys()]) await apply(rel)

  for (const rel of ['local/overrides.sql', ...listSql('seeds'), ...listSql('local').filter(f => /\/seed-/.test(f))]) {
    await apply(rel)
  }

  // Superseded files (e.g. old systems a later migration drops) are expected to fail.
  const unexpected = [...failures].filter(([rel]) => !EXPECTED_FAILURES.has(rel))
  for (const [rel, err] of unexpected) console.warn(`[local-db] ${rel} failed: ${err}`)
  console.log(`[local-db] in-memory database ready in ${Date.now() - started}ms`)

  return db
}

/** Old-system files that depend on functions a later migration removes. */
const EXPECTED_FAILURES = new Set<string>(['migrations/coaching-feedback-schema.sql'])
