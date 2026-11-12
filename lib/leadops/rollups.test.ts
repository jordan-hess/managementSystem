import { weeklyRollupFromDaily } from './rollups'
import type { DailyActivityLog } from './types'

function daily(overrides: Partial<DailyActivityLog> & Pick<DailyActivityLog, 'tl_id' | 'date'>): DailyActivityLog {
  return {
    id: `d-${overrides.tl_id}-${overrides.date}`,
    calls_listened: 0,
    tickets_reviewed: 0,
    audits_completed: 0,
    critical_fails: 0,
    coaching_sessions: 0,
    agent_in_seat: false,
    notes: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const WEEK_START = '2026-09-21' // a Monday
const WEEK_END = '2026-09-27' // the following Sunday

describe('weeklyRollupFromDaily', () => {
  it('sums coaching sessions across the week for one team leader', () => {
    const logs = [
      daily({ tl_id: 'tl-1', date: '2026-09-21', coaching_sessions: 1 }),
      daily({ tl_id: 'tl-1', date: '2026-09-23', coaching_sessions: 2 }),
      daily({ tl_id: 'tl-1', date: '2026-09-25', coaching_sessions: 1 }),
    ]
    expect(weeklyRollupFromDaily(logs, 'tl-1', WEEK_START).coachingSessions).toBe(4)
  })

  it('counts agent-in-seat DAYS, not a sum — a day is either in-seat or not', () => {
    const logs = [
      daily({ tl_id: 'tl-1', date: '2026-09-21', agent_in_seat: true }),
      daily({ tl_id: 'tl-1', date: '2026-09-22', agent_in_seat: false }),
      daily({ tl_id: 'tl-1', date: '2026-09-23', agent_in_seat: true }),
    ]
    expect(weeklyRollupFromDaily(logs, 'tl-1', WEEK_START).agentInSeatDays).toBe(2)
  })

  it('sums critical fails across the week', () => {
    const logs = [
      daily({ tl_id: 'tl-1', date: '2026-09-21', critical_fails: 0 }),
      daily({ tl_id: 'tl-1', date: '2026-09-22', critical_fails: 1 }),
      daily({ tl_id: 'tl-1', date: '2026-09-24', critical_fails: 2 }),
    ]
    expect(weeklyRollupFromDaily(logs, 'tl-1', WEEK_START).criticalFails).toBe(3)
  })

  it('is inclusive of both the Monday and the Sunday boundary', () => {
    const logs = [
      daily({ tl_id: 'tl-1', date: WEEK_START, coaching_sessions: 1 }),
      daily({ tl_id: 'tl-1', date: WEEK_END, coaching_sessions: 1 }),
    ]
    expect(weeklyRollupFromDaily(logs, 'tl-1', WEEK_START).coachingSessions).toBe(2)
  })

  it('excludes a day one past the week end', () => {
    const logs = [
      daily({ tl_id: 'tl-1', date: WEEK_END, coaching_sessions: 1 }),
      daily({ tl_id: 'tl-1', date: '2026-09-28', coaching_sessions: 5 }), // the following Monday
    ]
    expect(weeklyRollupFromDaily(logs, 'tl-1', WEEK_START).coachingSessions).toBe(1)
  })

  it('excludes a day one before the week start', () => {
    const logs = [
      daily({ tl_id: 'tl-1', date: '2026-09-20', coaching_sessions: 9 }), // the prior Sunday
      daily({ tl_id: 'tl-1', date: WEEK_START, coaching_sessions: 1 }),
    ]
    expect(weeklyRollupFromDaily(logs, 'tl-1', WEEK_START).coachingSessions).toBe(1)
  })

  it('scopes strictly to the requested team leader', () => {
    const logs = [
      daily({ tl_id: 'tl-1', date: '2026-09-22', coaching_sessions: 3 }),
      daily({ tl_id: 'tl-2', date: '2026-09-22', coaching_sessions: 10 }),
    ]
    expect(weeklyRollupFromDaily(logs, 'tl-1', WEEK_START).coachingSessions).toBe(3)
    expect(weeklyRollupFromDaily(logs, 'tl-2', WEEK_START).coachingSessions).toBe(10)
  })

  it('returns all zeros for a team leader/week with no daily logs at all', () => {
    expect(weeklyRollupFromDaily([], 'tl-1', WEEK_START)).toEqual({
      coachingSessions: 0,
      agentInSeatDays: 0,
      criticalFails: 0,
    })
  })

  it('handles a month boundary inside the week without drifting', () => {
    // Week of 2026-09-28 runs into October.
    const logs = [
      daily({ tl_id: 'tl-1', date: '2026-09-29', coaching_sessions: 1 }),
      daily({ tl_id: 'tl-1', date: '2026-10-02', coaching_sessions: 1 }),
      daily({ tl_id: 'tl-1', date: '2026-10-04', coaching_sessions: 1 }), // the Sunday, week end
      daily({ tl_id: 'tl-1', date: '2026-10-05', coaching_sessions: 9 }), // the following Monday
    ]
    expect(weeklyRollupFromDaily(logs, 'tl-1', '2026-09-28').coachingSessions).toBe(3)
  })
})
