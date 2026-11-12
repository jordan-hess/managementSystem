/** @jest-environment jsdom */
import { getLastSeen, setLastSeen, countUnseen, newestTimestamp } from './lastSeen'

beforeEach(() => localStorage.clear())

describe('newestTimestamp', () => {
  it('returns the latest created_at in ms', () => {
    const items = [{ created_at: '2026-10-01T10:00:00Z' }, { created_at: '2026-10-03T10:00:00Z' }, { created_at: '2026-10-02T10:00:00Z' }]
    expect(newestTimestamp(items)).toBe(Date.parse('2026-10-03T10:00:00Z'))
  })

  it('returns null for an empty list', () => {
    expect(newestTimestamp([])).toBeNull()
  })
})

describe('getLastSeen / setLastSeen', () => {
  it('returns null when nothing is stored', () => {
    expect(getLastSeen('announcements', 'u1')).toBeNull()
  })

  it('round-trips a value, scoped per key and per user', () => {
    setLastSeen('announcements', 'u1', 1000)
    expect(getLastSeen('announcements', 'u1')).toBe(1000)
    expect(getLastSeen('announcements', 'u2')).toBeNull()
    expect(getLastSeen('notifications', 'u1')).toBeNull()
  })

  it('ignores a corrupt stored value', () => {
    localStorage.setItem('opshub:lastSeen:announcements:u1', 'not-a-number')
    expect(getLastSeen('announcements', 'u1')).toBeNull()
  })

  it('never throws when storage is unavailable', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const setSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(getLastSeen('announcements', 'blocked-user')).toBeNull()
    expect(() => setLastSeen('announcements', 'blocked-user', 1)).not.toThrow()
    // a failed write is still remembered for the rest of this page session
    expect(getLastSeen('announcements', 'blocked-user')).toBe(1)
    spy.mockRestore()
    setSpy.mockRestore()
  })
})

describe('countUnseen', () => {
  const items = [
    { created_at: '2026-10-01T10:00:00Z' },
    { created_at: '2026-10-02T10:00:00Z' },
    { created_at: '2026-10-03T10:00:00Z' },
  ]

  it('counts everything when never seen', () => {
    expect(countUnseen(items, null)).toBe(3)
  })

  it('counts only items newer than lastSeen', () => {
    expect(countUnseen(items, Date.parse('2026-10-02T10:00:00Z'))).toBe(1)
  })

  it('is zero when lastSeen is at or after the newest item', () => {
    expect(countUnseen(items, Date.parse('2026-10-03T10:00:00Z'))).toBe(0)
  })
})
