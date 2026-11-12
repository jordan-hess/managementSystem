/** @jest-environment node */
import { createLocalSql } from './sqlAdapter'

type Call = { text: string; params: unknown[]; via: string }

function fakeDb(rows: Record<string, unknown>[] = [], affectedRows = 0) {
  const calls: Call[] = []
  const make = (via: string) => ({
    query: jest.fn(async (text: string, params: unknown[]) => {
      calls.push({ text: text.replace(/\s+/g, ' ').trim(), params, via })
      return { rows, affectedRows, fields: [] }
    }),
  })
  const db = {
    ...make('db'),
    transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(make('tx'))),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql = createLocalSql(async () => db as any) as any
  return { sql, calls, db }
}

describe('local sql adapter', () => {
  it('parameterizes values and inlines nested fragments in order', async () => {
    const { sql, calls } = fakeDb()
    const extra = sql`AND b = ${2}`
    await sql`SELECT * FROM t WHERE a = ${1} ${extra} AND c = ${3} ${sql``}`
    expect(calls[0].text).toBe('SELECT * FROM t WHERE a = $1 AND b = $2 AND c = $3')
    expect(calls[0].params).toEqual([1, 2, 3])
  })

  it('escapes identifiers, including dotted ones', async () => {
    const { sql, calls } = fakeDb()
    await sql`SELECT ${sql('t.issue_type')}, ${sql('we"ird')} FROM t`
    expect(calls[0].text).toBe('SELECT "t"."issue_type", "we""ird" FROM t')
  })

  it('renders IN lists, and an empty list that matches nothing', async () => {
    const { sql, calls } = fakeDb()
    await sql`SELECT 1 WHERE s IN ${sql(['open', 'closed'])}`
    await sql`SELECT 1 WHERE s IN ${sql([])}`
    expect(calls[0].text).toBe('SELECT 1 WHERE s IN ($1, $2)')
    expect(calls[0].params).toEqual(['open', 'closed'])
    expect(calls[1].text).toBe('SELECT 1 WHERE s IN (NULL)')
  })

  it('renders SET assignments from an object', async () => {
    const { sql, calls } = fakeDb()
    await sql`UPDATE profiles SET ${sql({ full_name: 'A', is_active: false })} WHERE id = ${'u1'}`
    expect(calls[0].text).toBe('UPDATE profiles SET "full_name" = $1, "is_active" = $2 WHERE id = $3')
    expect(calls[0].params).toEqual(['A', false, 'u1'])
  })

  it('renders INSERT columns and values, honoring an explicit column list', async () => {
    const { sql, calls } = fakeDb()
    await sql`INSERT INTO t ${sql([{ a: 1, b: 2 }, { a: 3, b: 4 }])}`
    await sql`INSERT INTO t ${sql({ a: 1, b: 2, c: 3 }, 'a', 'c')}`
    expect(calls[0].text).toBe('INSERT INTO t ("a", "b") VALUES ($1, $2), ($3, $4)')
    expect(calls[1].text).toBe('INSERT INTO t ("a", "c") VALUES ($1, $2)')
    expect(calls[1].params).toEqual([1, 3])
  })

  it('JSON-encodes sql.json values and maps undefined to NULL', async () => {
    const { sql, calls } = fakeDb()
    await sql`INSERT INTO t VALUES (${sql.json({ a: [1] })}, ${undefined})`
    expect(calls[0].params).toEqual(['{"a":[1]}', null])
  })

  it('is lazy: nothing runs until awaited, and runs once', async () => {
    const { sql, calls } = fakeDb()
    const q = sql`SELECT 1`
    expect(calls).toHaveLength(0)
    await q
    await q
    expect(calls).toHaveLength(1)
  })

  it('returns rows with a postgres.js-style count', async () => {
    const { sql } = fakeDb([{ id: 1 }, { id: 2 }])
    const rows = await sql`SELECT id FROM t`
    expect([...rows]).toEqual([{ id: 1 }, { id: 2 }])
    expect(rows.count).toBe(2)
    const { sql: sql2 } = fakeDb([], 5)
    expect((await sql2`UPDATE t SET a = 1`).count).toBe(5)
  })

  it('routes queries inside sql.begin, including the global sql, to the transaction', async () => {
    const { sql, calls } = fakeDb()
    const result = await sql.begin(async (tx: typeof sql) => {
      await tx`SELECT 'via tx'`
      await sql`SELECT 'via global'`
      await tx.begin(async (inner: typeof sql) => inner`SELECT 'nested'`)
      return 'done'
    })
    await sql`SELECT 'after'`
    expect(result).toBe('done')
    expect(calls.map(c => c.via)).toEqual(['tx', 'tx', 'tx', 'db'])
  })
})
