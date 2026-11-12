jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { getProfilesOnShiftAt, getRosterAt } from './onShift'

const mockSql = sql as unknown as jest.Mock
const text = (args: unknown[]) => (Array.isArray(args[0]) ? (args[0] as string[]).join(' ') : '')

// 2026-10-12 is a Monday. Day 0 EARLY (08:00-17:00), day 1 LATE (11:00-20:00), day 2 OFF, repeating.
const PATTERN = { id: 'pat1', shift_sequence: ['EARLY', 'LATE', 'OFF'], anchor_date: '2026-10-12' }

function prime(opts: { attendance?: unknown[]; overrides?: unknown[]; patternId?: string | null } = {}) {
  const { attendance = [], overrides = [], patternId = 'pat1' } = opts
  mockSql.mockImplementation((...args: unknown[]) => {
    const t = text(args)
    if (t.includes('FROM attendance_records')) return Promise.resolve(attendance)
    if (t.includes('FROM roster_overrides')) return Promise.resolve(overrides)
    if (t.includes('FROM roster_rotation_patterns')) return Promise.resolve([PATTERN])
    if (t.includes('FROM profiles')) return Promise.resolve([{ id: 'p1', rotation_pattern_id: patternId }])
    return Promise.resolve([]) // team_members, teams
  })
}

const onShift = async (iso: string) => (await getProfilesOnShiftAt(['p1'], new Date(iso))).has('p1')

beforeEach(() => mockSql.mockReset())

describe('getProfilesOnShiftAt', () => {
  it('is on shift in the middle of the shift', async () => {
    prime()
    expect(await onShift('2026-10-12T08:00:00Z')).toBe(true) // Mon 10:00 SAST, EARLY
  })

  it('counts the exact shift start as on shift and the exact shift end as off shift', async () => {
    prime()
    expect(await onShift('2026-10-12T06:00:00Z')).toBe(true) // 08:00 SAST
    expect(await onShift('2026-10-12T05:59:00Z')).toBe(false) // 07:59 SAST
    expect(await onShift('2026-10-12T14:59:00Z')).toBe(true) // 16:59 SAST
    expect(await onShift('2026-10-12T15:00:00Z')).toBe(false) // 17:00 SAST
  })

  it('uses the late shift hours on a late day', async () => {
    prime()
    expect(await onShift('2026-10-13T08:00:00Z')).toBe(false) // Tue 10:00 SAST, LATE starts at 11:00
    expect(await onShift('2026-10-13T10:00:00Z')).toBe(true) // Tue 12:00 SAST
  })

  it('is off on a rostered off day', async () => {
    prime()
    expect(await onShift('2026-10-14T08:00:00Z')).toBe(false) // Wed, OFF
  })

  it('is on shift on an off day when a swap-in override gives them a shift', async () => {
    prime({ overrides: [{ profile_id: 'p1', date: '2026-10-14', override_type: 'swap_in', override_shift: 'LATE' }] })
    expect(await onShift('2026-10-14T10:00:00Z')).toBe(true) // Wed 12:00 SAST
  })

  it('is not on shift when attendance says sick, absent or leave', async () => {
    for (const status of ['sick', 'absent', 'leave']) {
      prime({ attendance: [{ profile_id: 'p1', date: '2026-10-12', status }] })
      expect(await onShift('2026-10-12T08:00:00Z')).toBe(false)
    }
  })

  it('counts a late arrival as on shift', async () => {
    prime({ attendance: [{ profile_id: 'p1', date: '2026-10-12', status: 'late' }] })
    expect(await onShift('2026-10-12T08:00:00Z')).toBe(true)
  })

  it('is not on shift with no rotation at all', async () => {
    prime({ patternId: null })
    expect(await onShift('2026-10-12T08:00:00Z')).toBe(false)
  })

  it('does no work for an empty list', async () => {
    expect((await getProfilesOnShiftAt([], new Date())).size).toBe(0)
    expect(mockSql).not.toHaveBeenCalled()
  })
})

describe('getRosterAt', () => {
  it('reports a profile with no rotation as unrostered, not on shift', async () => {
    prime({ patternId: null })
    const roster = await getRosterAt(['p1'], new Date('2026-10-12T08:00:00Z'))
    expect(roster.unrostered.has('p1')).toBe(true)
    expect(roster.onShift.has('p1')).toBe(false)
  })

  it('reports a rostered off-day profile as neither on shift nor unrostered', async () => {
    prime()
    const roster = await getRosterAt(['p1'], new Date('2026-10-14T08:00:00Z')) // Wed, OFF
    expect(roster.onShift.has('p1')).toBe(false)
    expect(roster.unrostered.has('p1')).toBe(false)
  })
})
