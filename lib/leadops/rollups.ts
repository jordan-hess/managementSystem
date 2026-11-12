/**
 * leadOps — daily→weekly rollups. Pure functions, no I/O.
 *
 * Coaching sessions held, agent-in-seat days and critical fails logged are
 * captured ONCE, on the Daily Activity form, and rolled up here for the
 * Weekly Activity Log view. They are not re-entered on the weekly form —
 * doing so would mean typing the same figure twice (the brief's own "users
 * should not have to enter the same information multiple times"), and the
 * two could silently disagree.
 *
 * Calibration attended and re-audits completed have no daily equivalent, so
 * they stay genuinely weekly-manual fields — see WeeklySection.tsx.
 */

import type { DailyActivityLog } from './types'

export interface WeeklyRollup {
  coachingSessions: number
  agentInSeatDays: number
  criticalFails: number
}

/**
 * Sums the three daily-sourced weekly fields for one team leader over the
 * ISO week starting `weekStart` ('YYYY-MM-DD', a Monday). Filters on the
 * date range rather than requiring pre-bucketed input, so callers can pass
 * the TL's whole daily-log history.
 */
export function weeklyRollupFromDaily(
  dailyLogs: DailyActivityLog[],
  tlId: string,
  weekStart: string,
): WeeklyRollup {
  const weekEnd = addDays(weekStart, 6)
  const inWeek = dailyLogs.filter((l) => l.tl_id === tlId && l.date >= weekStart && l.date <= weekEnd)

  return {
    coachingSessions: inWeek.reduce((sum, l) => sum + l.coaching_sessions, 0),
    agentInSeatDays: inWeek.filter((l) => l.agent_in_seat).length,
    criticalFails: inWeek.reduce((sum, l) => sum + l.critical_fails, 0),
  }
}

/** 'YYYY-MM-DD' + n days, via UTC to avoid DST/local-time drift — same idiom as lib/roster/rotationEngine.ts. */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d) + n * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}
