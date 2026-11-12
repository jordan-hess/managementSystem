import { AsyncLocalStorage } from 'node:async_hooks'
import type { PGlite, Transaction } from '@electric-sql/pglite'

/**
 * A postgres.js-compatible `sql` tagged template backed by an in-process
 * PGlite instance. Covers the subset of postgres.js this codebase uses:
 *
 *   sql`... ${value} ...`           parameterized query (lazy, runs on await)
 *   sql`... ${sql`fragment`} ...`   nested fragments, sql`` for "nothing"
 *   sql('column') / sql('t.col')    escaped identifier
 *   sql(['a', 'b'])                 IN-list: ($1, $2)
 *   SET ${sql({ a: 1, b: 2 })}      assignment list (also INSERT INTO t ${sql(obj)})
 *   sql.json(value)                 jsonb parameter
 *   sql.begin(async tx => ...)      transaction; `tx` has this same API
 *
 * Results are row arrays with `.count` (affected rows) like postgres.js.
 * Inside a transaction, the global `sql` is routed to that transaction via
 * AsyncLocalStorage: PGlite has a single connection, so a helper that used
 * the global `sql` mid-transaction would otherwise wait on the tx forever.
 */

type Queryable = Pick<PGlite, 'query'> | Transaction
type Getter = () => Promise<PGlite>

class Identifier {
  constructor(readonly name: string) {}
  render(): string {
    return this.name.split('.').map(part => '"' + part.replace(/"/g, '""') + '"').join('.')
  }
}

class Helper {
  constructor(readonly value: unknown, readonly columns?: string[]) {}
}

class JsonParam {
  constructor(readonly value: unknown) {}
}

const escapeIdent = (s: string) => new Identifier(s).render()

export class Query<T = Record<string, unknown>[]> implements PromiseLike<T> {
  private promise: Promise<T> | null = null

  constructor(
    readonly strings: readonly string[],
    readonly values: unknown[],
    private readonly run: (text: string, params: unknown[]) => Promise<T>,
  ) {}

  /** Renders this query (and any nested fragments) into text + params, appending to `params`. */
  build(params: unknown[]): string {
    let text = this.strings[0]
    for (let i = 0; i < this.values.length; i++) {
      text += renderValue(this.values[i], params, text) + this.strings[i + 1]
    }
    return text
  }

  private execute(): Promise<T> {
    if (!this.promise) {
      const params: unknown[] = []
      const text = this.build(params)
      this.promise = this.run(text, params)
    }
    return this.promise
  }

  then<R1 = T, R2 = never>(
    onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.execute().then(onFulfilled, onRejected)
  }

  catch<R = never>(onRejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<T | R> {
    return this.execute().catch(onRejected)
  }

  finally(onFinally?: (() => void) | null): Promise<T> {
    return this.execute().finally(onFinally)
  }
}

function pushParam(params: unknown[], value: unknown): string {
  params.push(value === undefined ? null : value)
  return '$' + params.length
}

function renderValue(value: unknown, params: unknown[], precedingText: string): string {
  if (value instanceof Query) return value.build(params)
  if (value instanceof Identifier) return value.render()
  if (value instanceof JsonParam) return pushParam(params, value.value === null ? 'null' : JSON.stringify(value.value))
  if (value instanceof Helper) return renderHelper(value, params, precedingText)
  return pushParam(params, value)
}

function renderHelper(helper: Helper, params: unknown[], precedingText: string): string {
  const { value, columns } = helper

  // sql(['a', 'b']) -> ($1, $2) for IN lists. An empty list can't match anything.
  if (Array.isArray(value) && (value.length === 0 || typeof value[0] !== 'object' || value[0] === null)) {
    if (value.length === 0) return '(NULL)'
    return '(' + value.map(v => pushParam(params, v)).join(', ') + ')'
  }

  const rows = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[]
  const cols = columns ?? Object.keys(rows[0] ?? {})

  if (/\binsert\s+into\s+\S+\s*$/i.test(precedingText)) {
    const valueLists = rows.map(row => '(' + cols.map(c => pushParam(params, row[c])).join(', ') + ')')
    return '(' + cols.map(escapeIdent).join(', ') + ') VALUES ' + valueLists.join(', ')
  }
  if (/\bset\s*$/i.test(precedingText)) {
    return cols.map(c => escapeIdent(c) + ' = ' + pushParam(params, rows[0][c])).join(', ')
  }
  // SELECT ${sql(['a','b'])}-style column lists of objects aren't used; fall back to identifiers.
  return cols.map(escapeIdent).join(', ')
}

const txStore = new AsyncLocalStorage<Queryable>()

function toResult(res: { rows: unknown[]; affectedRows?: number; fields: { name: string }[] }) {
  const rows = res.rows as Record<string, unknown>[] & { count: number; columns: { name: string }[] }
  rows.count = res.affectedRows || res.rows.length
  rows.columns = res.fields
  return rows
}

function createSql(resolve: () => Promise<Queryable>) {
  const run = async (text: string, params: unknown[]) => toResult(await (await resolve()).query(text, params))

  function sql(first: unknown, ...rest: unknown[]): unknown {
    if (Array.isArray(first) && 'raw' in (first as object)) {
      return new Query(first as readonly string[], rest, run)
    }
    if (typeof first === 'string') return new Identifier(first)
    const columns = rest.flat() as string[]
    return new Helper(first, columns.length ? columns : undefined)
  }

  sql.json = (value: unknown) => new JsonParam(value)
  sql.unsafe = (text: string, params: unknown[] = []) => run(text, params)
  return sql
}

/** The transaction-scoped `sql` handed to sql.begin callbacks. */
function createTxSql(tx: Transaction) {
  const sql = createSql(async () => tx) as ReturnType<typeof createSql> & Record<string, unknown>
  sql.begin = (fn: (t: unknown) => unknown) => fn(sql) // nested begin = same transaction
  return sql
}

export function createLocalSql(getDb: Getter) {
  const sql = createSql(async () => txStore.getStore() ?? (await getDb())) as ReturnType<typeof createSql> &
    Record<string, unknown>

  sql.begin = async (fn: (tx: unknown) => unknown) => {
    const current = txStore.getStore()
    if (current) return fn(createTxSql(current as Transaction))
    const db = await getDb()
    return db.transaction(tx => txStore.run(tx, () => Promise.resolve(fn(createTxSql(tx)))))
  }
  sql.end = async () => {}

  return sql
}
