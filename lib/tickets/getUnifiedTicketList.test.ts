jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { getUnifiedTicketList } from './getUnifiedTicketList'

const mockSql = sql as unknown as jest.Mock

function templateText(args: unknown[]): string {
  const first = args[0]
  return Array.isArray(first) ? (first as string[]).join(' ') : ''
}

function baseFilters() {
  return {
    queue: 'all' as const,
    statusGroup: 'all' as const,
    mine: false,
    page: 0,
    pageSize: 20,
  }
}

describe('getUnifiedTicketList — queue: "all"', () => {
  beforeEach(() => {
    mockSql.mockReset()
  })

  it('computes totalCount from the paginated query itself, without a separate COUNT query, when rows are returned', async () => {
    let separateCountCalls = 0

    mockSql.mockImplementation((...args: unknown[]) => {
      const text = templateText(args)
      const isPaginatedRowsQuery = text.includes('LIMIT') && text.includes('FROM (')
      const isSeparateCountQuery = text.includes('COUNT(*)') && !text.includes('LIMIT')

      if (isPaginatedRowsQuery) {
        return Promise.resolve([
          { sourceType: 'support_ticket', sourceId: 'a', totalCount: '7' },
          { sourceType: 'followup', sourceId: 'b', totalCount: '7' },
        ])
      }
      if (isSeparateCountQuery) {
        separateCountCalls++
        // Deliberately wrong, distinguishable from the real total (7) - if
        // the code still reads its count from this query instead of the
        // paginated one, this test catches it either way.
        return Promise.resolve([{ count: '999' }])
      }
      // Scope/status fragments and the unionBody CTE itself - never
      // awaited directly, just embedded as substitution values.
      return {}
    })

    const result = await getUnifiedTicketList(baseFilters(), { userId: 'admin-1', role: 'admin' })

    expect(result.totalCount).toBe(7)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).not.toHaveProperty('totalCount')
    expect(separateCountCalls).toBe(0)
  })

  it('falls back to a real COUNT query when the requested page is past the end of the result set', async () => {
    mockSql.mockImplementation((...args: unknown[]) => {
      const text = templateText(args)
      const isPaginatedRowsQuery = text.includes('LIMIT') && text.includes('FROM (')
      const isSeparateCountQuery = text.includes('COUNT(*)') && !text.includes('LIMIT')

      if (isPaginatedRowsQuery) return Promise.resolve([])
      if (isSeparateCountQuery) return Promise.resolve([{ count: '3' }])
      return {}
    })

    const result = await getUnifiedTicketList(
      { ...baseFilters(), page: 5 },
      { userId: 'admin-1', role: 'admin' },
    )

    expect(result.rows).toHaveLength(0)
    expect(result.totalCount).toBe(3)
  })
})

describe('getUnifiedTicketList — worked-on date range', () => {
  beforeEach(() => {
    mockSql.mockReset()
  })

  const RANGE = { updatedFrom: '2026-10-01', updatedTo: '2026-10-30' }

  /** Answers row/count queries and records every emitted template. */
  function run(queue: string, range: { updatedFrom?: string; updatedTo?: string }) {
    mockSql.mockImplementation((...args: unknown[]) => {
      const text = templateText(args)
      if (text.includes('LIMIT')) return Promise.resolve([{ sourceType: 'support_ticket', sourceId: 'a', totalCount: '1' }])
      if (text.includes('COUNT(*)')) return Promise.resolve([{ count: '1' }])
      return {}
    })
    return getUnifiedTicketList({ ...baseFilters(), queue: queue as 'all', ...range }, { userId: 'u', role: 'admin' })
  }

  function emitted(): string[] {
    return mockSql.mock.calls.map(templateText)
  }

  /** Whether `column` was emitted as a compared-column fragment. */
  function compared(column: string): boolean {
    return emitted().some(t => t.trim() === column)
  }

  it('emits no date predicate when neither bound is given', async () => {
    await run('all', {})
    expect(emitted().some(t => t.includes('::date'))).toBe(false)
    expect(emitted().some(t => t.includes('_history') || t.includes('ticket_events ev'))).toBe(false)
  })

  it('makes the upper bound cover the whole end day, not midnight', async () => {
    // A timestamptz `<= '2026-10-30'` would mean 00:00 and drop that day's work.
    await run('all', { updatedTo: '2026-10-30' })
    const bounds = emitted().filter(t => t.includes('::date'))
    expect(bounds.some(t => t.includes('<') && t.includes('+ 1'))).toBe(true)
    expect(bounds.some(t => t.includes('<='))).toBe(false)
  })

  // A ticket raised on the 1st and resolved today counts for both days: it
  // matches on creation, any status change / event, or its last edit.
  it('counts creation, status history and last edit for Social tickets and follow-ups', async () => {
    await run('all', RANGE)
    for (const col of ['st.created_at', 'st.updated_at', 'sh.changed_at', 'f.created_at', 'f.updated_at', 'fh.changed_at', 'cb.created_at', 'cb.updated_at']) {
      expect(compared(col)).toBe(true)
    }
    expect(emitted().some(t => t.includes('support_ticket_status_history'))).toBe(true)
    expect(emitted().some(t => t.includes('followup_status_history'))).toBe(true)
  })

  it('counts creation and every event for T2 tickets', async () => {
    await run('all', RANGE)
    expect(compared("(t.created_at::timestamp AT TIME ZONE 'UTC')")).toBe(true)
    expect(compared("(ev.created_at::timestamp AT TIME ZONE 'UTC')")).toBe(true)
  })

  // Picking one queue used to drop the date range entirely — only the
  // All-queues UNION applied it.
  it.each([
    ['a Social channel', 'freescout', 'sh.changed_at'],
    ['a T2 queue', 'VOICE', "(ev.created_at::timestamp AT TIME ZONE 'UTC')"],
  ])('applies the range when %s is selected', async (_label, queue, historyColumn) => {
    await run(queue, RANGE)
    const queries = emitted().filter(t => t.includes('LIMIT') || t.includes('COUNT(*)'))
    expect(queries).toHaveLength(2)
    expect(compared(historyColumn)).toBe(true)
  })

  it('carries the range into the fallback COUNT query too', async () => {
    // Otherwise a page past the end of a filtered result set reports the
    // unfiltered total, and the pager offers pages that render empty.
    let countUsedUnion = false
    mockSql.mockImplementation((...args: unknown[]) => {
      const text = templateText(args)
      if (text.includes('LIMIT') && text.includes('FROM (')) return Promise.resolve([])
      if (text.includes('COUNT(*)') && !text.includes('LIMIT')) {
        countUsedUnion = text.includes('FROM (')
        return Promise.resolve([{ count: '0' }])
      }
      return {}
    })

    await getUnifiedTicketList({ ...baseFilters(), page: 9, ...RANGE }, { userId: 'u', role: 'admin' })

    expect(countUsedUnion).toBe(true)
    expect(compared('sh.changed_at')).toBe(true)
  })
})

describe('getUnifiedTicketList — manual callbacks', () => {
  beforeEach(() => {
    mockSql.mockReset()
  })

  it('names a customer-less callback by its contact label and keeps every UNION branch the same width', async () => {
    const unionTexts: string[] = []
    let outerText = ''
    mockSql.mockImplementation((...args: unknown[]) => {
      const text = templateText(args)
      if (text.includes('UNION ALL')) unionTexts.push(text)
      if (text.includes('LIMIT') && text.includes('FROM (')) {
        outerText = text
        return Promise.resolve([{ sourceType: 'callback', sourceId: 'cb-1', customerId: null, customerName: 'Ann', totalCount: '1' }])
      }
      return {}
    })

    const result = await getUnifiedTicketList(baseFilters(), { userId: 'admin-1', role: 'admin' })

    expect(result.rows[0]).toMatchObject({ customerId: null, customerName: 'Ann' })
    expect(outerText).toContain('COALESCE(cu.name, x.contact_label)')
    expect(unionTexts[0]).toContain('COALESCE(cb.contact_name, cb.contact_phone, cb.contact_email)')
    expect(unionTexts[0].match(/contact_label|NULL::text, NULL::text, (NULL::text|COALESCE)/g)?.length).toBeGreaterThanOrEqual(4)
  })
})
