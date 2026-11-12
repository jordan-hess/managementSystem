'use server'

/**
 * leadOps Daily & Weekly Activity — real data. Separate from realDataActions.ts
 * on purpose: activity data grows every day, so it is loaded by date window, and
 * a problem with these tables must never take down KPI Actuals or the Manager
 * Scorecard. See docs/superpowers/specs/2026-10-09-leadops-daily-weekly-activity-design.md.
 *
 * Every action starts with requireLeadOps() (session + active account) and
 * re-applies the permissions.ts rules, because a Server Action is a public POST
 * endpoint. Nothing the client sends is trusted for identity: ids, timestamps and
 * the manager id are set here.
 */

import { sql } from '@/lib/db/pool'
import { canEnterManagerWeekly, canEnterSourceData, isManagementTier, isTeamLeader } from './permissions'
import { daysBetweenIso, isMonday, isValidIsoDate, todayInSouthAfrica, weekStartFor } from './periods'
import { MAX_COUNT, MAX_NOTES } from './activityLimits'
import { requireLeadOps, resolveLeadOpsPeople } from './serverGuard'
import type { DailyActivityLog, ManagerWeeklyLog, WeeklyManualLog } from './types'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

const MAX_WINDOW_DAYS = 400

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_COUNT

// ─── Row shapes (date columns already come back as 'YYYY-MM-DD' strings, see lib/db/pool.ts) ──

interface DailyRow {
  id: string
  tl_id: string | null
  date: string
  calls_listened: number
  tickets_reviewed: number
  audits_completed: number
  critical_fails: number
  coaching_sessions: number
  agent_in_seat: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

const toDaily = (r: DailyRow): DailyActivityLog => ({
  id: r.id,
  tl_id: r.tl_id,
  date: r.date,
  calls_listened: Number(r.calls_listened),
  tickets_reviewed: Number(r.tickets_reviewed),
  audits_completed: Number(r.audits_completed),
  critical_fails: Number(r.critical_fails),
  coaching_sessions: Number(r.coaching_sessions),
  agent_in_seat: r.agent_in_seat,
  notes: r.notes,
  created_at: r.created_at,
  updated_at: r.updated_at,
})

interface WeeklyRow {
  tl_id: string
  week_of: string
  calibration: boolean
  re_audits: number
}

const toWeekly = (r: WeeklyRow): WeeklyManualLog => ({
  tl_id: r.tl_id,
  week_of: r.week_of,
  calibration: r.calibration,
  re_audits: Number(r.re_audits),
})

interface ManagerRow {
  manager_id: string
  week_of: string
  interactions_sampled: number
  calibration_spot_check: boolean
  tl_one_on_ones: number
}

const toManager = (r: ManagerRow): ManagerWeeklyLog => ({
  manager_id: r.manager_id,
  week_of: r.week_of,
  interactions_sampled: Number(r.interactions_sampled),
  calibration_spot_check: r.calibration_spot_check,
  tl_one_on_ones: Number(r.tl_one_on_ones),
})

// ─── Fetch ────────────────────────────────────────────────────────────────

export interface LeadOpsActivityData {
  dailyLogs: DailyActivityLog[]
  weeklyLogs: WeeklyManualLog[]
  managerLogs: ManagerWeeklyLog[]
}

/**
 * The rows whose date / week falls in [from, to] (at most 400 days). A team
 * leader gets their own rows only and never the manager weekly log;
 * management/HOD get everyone's plus the manager weekly log.
 */
export async function fetchLeadOpsActivityAction(from: string, to: string): Promise<ActionResult<LeadOpsActivityData>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  if (!isManagementTier(viewer) && !isTeamLeader(viewer)) return { error: 'Forbidden' }

  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to || daysBetweenIso(from, to) > MAX_WINDOW_DAYS) {
    return { error: 'Invalid date range.' }
  }
  const weekFrom = weekStartFor(from)

  try {
    if (isManagementTier(viewer)) {
      const [dailyRows, weeklyRows, managerRows] = await Promise.all([
        sql<DailyRow[]>`SELECT * FROM daily_activity_logs WHERE date >= ${from} AND date <= ${to} ORDER BY date`,
        sql<WeeklyRow[]>`SELECT * FROM weekly_manual_logs WHERE week_of >= ${weekFrom} AND week_of <= ${to} ORDER BY week_of`,
        sql<ManagerRow[]>`SELECT * FROM manager_weekly_log WHERE week_of >= ${weekFrom} AND week_of <= ${to} ORDER BY week_of`,
      ])
      return { data: { dailyLogs: dailyRows.map(toDaily), weeklyLogs: weeklyRows.map(toWeekly), managerLogs: managerRows.map(toManager) } }
    }

    const [dailyRows, weeklyRows] = await Promise.all([
      sql<DailyRow[]>`SELECT * FROM daily_activity_logs WHERE tl_id = ${userId} AND date >= ${from} AND date <= ${to} ORDER BY date`,
      sql<WeeklyRow[]>`SELECT * FROM weekly_manual_logs WHERE tl_id = ${userId} AND week_of >= ${weekFrom} AND week_of <= ${to} ORDER BY week_of`,
    ])
    return { data: { dailyLogs: dailyRows.map(toDaily), weeklyLogs: weeklyRows.map(toWeekly), managerLogs: [] } }
  } catch (error) {
    console.error('fetchLeadOpsActivityAction failed', error)
    return { error: 'Could not load activity data.' }
  }
}

// ─── Saves ────────────────────────────────────────────────────────────────

/** A team leader's own daily entry — and only for today (South Africa). */
export async function upsertDailyLogAction(log: DailyActivityLog): Promise<ActionResult<DailyActivityLog>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  if (!canEnterSourceData(viewer) || log.tl_id !== userId) return { error: 'Forbidden' }

  if (!isValidIsoDate(log.date)) return { error: 'Invalid date.' }
  if (log.date !== todayInSouthAfrica(new Date())) return { error: 'Daily entries can only be changed on the day.' }
  if (![log.calls_listened, log.tickets_reviewed, log.audits_completed, log.critical_fails, log.coaching_sessions].every(isCount)) {
    return { error: 'Invalid count.' }
  }
  if (log.notes !== null && (typeof log.notes !== 'string' || log.notes.length > MAX_NOTES)) return { error: 'Notes are too long.' }

  try {
    const [row] = await sql<DailyRow[]>`
      INSERT INTO daily_activity_logs (tl_id, date, calls_listened, tickets_reviewed, audits_completed, critical_fails, coaching_sessions, agent_in_seat, notes)
      VALUES (${userId}, ${log.date}, ${log.calls_listened}, ${log.tickets_reviewed}, ${log.audits_completed}, ${log.critical_fails}, ${log.coaching_sessions}, ${log.agent_in_seat === true}, ${log.notes})
      ON CONFLICT (tl_id, date) DO UPDATE SET
        calls_listened = EXCLUDED.calls_listened,
        tickets_reviewed = EXCLUDED.tickets_reviewed,
        audits_completed = EXCLUDED.audits_completed,
        critical_fails = EXCLUDED.critical_fails,
        coaching_sessions = EXCLUDED.coaching_sessions,
        agent_in_seat = EXCLUDED.agent_in_seat,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING *
    `
    return { data: toDaily(row) }
  } catch (error) {
    console.error('upsertDailyLogAction failed', error)
    return { error: 'Could not save this daily entry.' }
  }
}

/** Validates a week_of for the weekly tables: a real Monday, not in the future. */
function weekError(weekOf: string): string | null {
  if (!isValidIsoDate(weekOf) || !isMonday(weekOf)) return 'Invalid week.'
  if (weekOf > weekStartFor(todayInSouthAfrica(new Date()))) return 'That week has not started yet.'
  return null
}

/** A team leader's own weekly manual fields (calibration, re-audits). */
export async function upsertWeeklyLogAction(log: WeeklyManualLog): Promise<ActionResult<WeeklyManualLog>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  if (!canEnterSourceData(viewer) || log.tl_id !== userId) return { error: 'Forbidden' }

  const badWeek = weekError(log.week_of)
  if (badWeek) return { error: badWeek }
  if (!isCount(log.re_audits)) return { error: 'Invalid count.' }

  try {
    const [row] = await sql<WeeklyRow[]>`
      INSERT INTO weekly_manual_logs (tl_id, week_of, calibration, re_audits)
      VALUES (${userId}, ${log.week_of}, ${log.calibration === true}, ${log.re_audits})
      ON CONFLICT (tl_id, week_of) DO UPDATE SET
        calibration = EXCLUDED.calibration,
        re_audits = EXCLUDED.re_audits,
        updated_at = now()
      RETURNING *
    `
    return { data: toWeekly(row) }
  } catch (error) {
    console.error('upsertWeeklyLogAction failed', error)
    return { error: 'Could not save this weekly entry.' }
  }
}

/** The manager's weekly record, written by management/HOD and always stored against the configured manager. */
export async function upsertManagerWeeklyLogAction(log: ManagerWeeklyLog): Promise<ActionResult<ManagerWeeklyLog>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  if (!canEnterManagerWeekly(guard.viewer)) return { error: 'Forbidden' }

  try {
    const people = await resolveLeadOpsPeople()
    if ('error' in people) return { error: people.error }

    const badWeek = weekError(log.week_of)
    if (badWeek) return { error: badWeek }
    if (!isCount(log.interactions_sampled) || !isCount(log.tl_one_on_ones)) return { error: 'Invalid count.' }

    const [row] = await sql<ManagerRow[]>`
      INSERT INTO manager_weekly_log (manager_id, week_of, interactions_sampled, calibration_spot_check, tl_one_on_ones)
      VALUES (${people.managerId}, ${log.week_of}, ${log.interactions_sampled}, ${log.calibration_spot_check === true}, ${log.tl_one_on_ones})
      ON CONFLICT (manager_id, week_of) DO UPDATE SET
        interactions_sampled = EXCLUDED.interactions_sampled,
        calibration_spot_check = EXCLUDED.calibration_spot_check,
        tl_one_on_ones = EXCLUDED.tl_one_on_ones,
        updated_at = now()
      RETURNING *
    `
    return { data: toManager(row) }
  } catch (error) {
    console.error('upsertManagerWeeklyLogAction failed', error)
    return { error: 'Could not save the manager weekly entry.' }
  }
}
