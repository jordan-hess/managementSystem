jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { getAgentsOffOnDate } from './scheduleAlerts'

const mockSql = sql as unknown as jest.Mock
const text = (args: unknown[]) => (Array.isArray(args[0]) ? (args[0] as string[]).join(' ') : '')

// 2026-10-12 is a Monday. Day 0 EARLY, day 1 LATE, day 2 OFF, repeating.
const PATTERN = { id: 'pat1', shift_sequence: ['EARLY', 'LATE', 'OFF'], anchor_date: '2026-10-12' }

function prime() {
  mockSql.mockImplementation((...args: unknown[]) => {
    const t = text(args)
    if (t.includes('FROM roster_rotation_patterns')) return Promise.resolve([PATTERN])
    if (t.includes('FROM profiles')) {
      return Promise.resolve([
        { id: 'p1', rotation_pattern_id: 'pat1' },
        { id: 'p2', rotation_pattern_id: null },
      ])
    }
    return Promise.resolve([]) // team_members, attendance, overrides, teams
  })
}

beforeEach(() => mockSql.mockReset())

describe('getAgentsOffOnDate', () => {
  it('returns the profiles whose roster says off that day', async () => {
    prime()
    const off = await getAgentsOffOnDate(['p1', 'p2'], new Date(2026, 9, 14)) // the OFF day
    expect([...off]).toEqual(['p1'])
  })

  it('does not return a profile on shift that day, or one with no rotation at all', async () => {
    prime()
    const off = await getAgentsOffOnDate(['p1', 'p2'], new Date(2026, 9, 12)) // an EARLY day
    expect(off.size).toBe(0)
  })

  it('does no work for an empty list', async () => {
    expect((await getAgentsOffOnDate([], new Date(2026, 9, 12))).size).toBe(0)
    expect(mockSql).not.toHaveBeenCalled()
  })
})
