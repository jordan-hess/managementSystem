import { sql } from '@/lib/db/pool'
import { requireActiveUser } from '@/lib/auth/requireUser'
import { isSubmitterTeamLeader } from '@/lib/auth/authz'
import type { DailyActivityLog, ManagerWeeklyLog, WeeklyManualLog } from './types'
import {
  fetchLeadOpsActivityAction,
  upsertDailyLogAction,
  upsertManagerWeeklyLogAction,
  upsertWeeklyLogAction,
} from './activityActions'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireActiveUser: jest.fn() }))
jest.mock('@/lib/auth/authz', () => ({ isSubmitterTeamLeader: jest.fn() }))

const mockSql = sql as unknown as jest.Mock
const mockRequireActiveUser = requireActiveUser as jest.Mock
const mockIsTeamLeader = isSubmitterTeamLeader as jest.Mock

const TODAY = '2026-10-08' // a Thursday
const MONDAY = '2026-10-05'
const NEXT_MONDAY = '2026-10-12'
const MANAGER_ID = 'mgr-1'

type Route = [RegExp, unknown | ((values: unknown[]) => unknown)]

/** Routes by SQL text rather than call order. First match wins; unmatched queries return []. */
function useSql(extra: Route[] = []) {
  const routes: Route[] = [
    ...extra,
    [/FROM profiles/, [{ id: MANAGER_ID, email: 'mgr@x.test', full_name: 'Alex' }, { id: 'hod-1', email: 'rev@x.test', full_name: 'Sam' }]],
  ]
  mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?')
    for (const [re, result] of routes) {
      if (re.test(text)) return typeof result === 'function' ? (result as (v: unknown[]) => unknown)(values) : result
    }
    return []
  })
}

const callsMatching = (re: RegExp) =>
  mockSql.mock.calls
    .map(([strings, ...values]) => ({ text: (strings as string[]).join('?'), values: values as unknown[] }))
    .filter((c) => re.test(c.text))

function signedInAs(userId: string, role: string, hasTeamRow = false) {
  mockRequireActiveUser.mockResolvedValue({ userId, role, t2Team: null, fullName: userId, forcePasswordChange: false })
  mockIsTeamLeader.mockResolvedValue(hasTeamRow)
}
const asTeamLeader = (id = 'tl-1') => signedInAs(id, 'admin', true)
const asManagement = () => signedInAs('mgmt-1', 'management')
const asHod = () => signedInAs('hod-1', 'hod')
const asPlainAdmin = () => signedInAs('admin-1', 'admin')
const asAgent = () => signedInAs('agent-1', 'agent')

const dailyRow = {
  id: 'd1', tl_id: 'tl-1', date: TODAY, calls_listened: 5, tickets_reviewed: 0, audits_completed: 0,
  critical_fails: 0, coaching_sessions: 1, agent_in_seat: true, notes: null, created_at: 't', updated_at: 't',
}
const weeklyRow = { tl_id: 'tl-1', week_of: MONDAY, calibration: true, re_audits: 2 }
const managerRow = { manager_id: MANAGER_ID, week_of: MONDAY, interactions_sampled: 4, calibration_spot_check: true, tl_one_on_ones: 3 }

const daily = (over: Partial<DailyActivityLog> = {}): DailyActivityLog => ({
  id: 'client-id', tl_id: 'tl-1', date: TODAY, calls_listened: 5, tickets_reviewed: 0, audits_completed: 0,
  critical_fails: 0, coaching_sessions: 1, agent_in_seat: true, notes: null, created_at: 'client', updated_at: 'client', ...over,
})
const weekly = (over: Partial<WeeklyManualLog> = {}): WeeklyManualLog => ({ tl_id: 'tl-1', week_of: MONDAY, calibration: true, re_audits: 2, ...over })
const managerWeekly = (over: Partial<ManagerWeeklyLog> = {}): ManagerWeeklyLog => ({
  manager_id: MANAGER_ID, week_of: MONDAY, interactions_sampled: 4, calibration_spot_check: true, tl_one_on_ones: 3, ...over,
})

beforeEach(() => {
  mockSql.mockReset()
  mockRequireActiveUser.mockReset()
  mockIsTeamLeader.mockReset()
  jest.useFakeTimers({ now: new Date('2026-10-08T10:00:00Z') }) // 12:00 in South Africa
  process.env.LEADOPS_MANAGER_EMAIL = 'mgr@x.test'
  process.env.LEADOPS_REVIEWER_EMAIL = 'rev@x.test'
  useSql([
    [/INSERT INTO daily_activity_logs/, [dailyRow]],
    [/INSERT INTO weekly_manual_logs/, [weeklyRow]],
    [/INSERT INTO manager_weekly_log/, [managerRow]],
  ])
})
afterEach(() => jest.useRealTimers())

describe('fetchLeadOpsActivityAction', () => {
  it('refuses agents and plain admins without touching the activity tables', async () => {
    asAgent()
    expect(await fetchLeadOpsActivityAction('2026-07-20', TODAY)).toEqual({ error: 'Forbidden' })
    asPlainAdmin()
    expect(await fetchLeadOpsActivityAction('2026-07-20', TODAY)).toEqual({ error: 'Forbidden' })
    expect(callsMatching(/daily_activity_logs/)).toHaveLength(0)
  })

  it('a team leader loads only their own rows, and never the manager weekly log', async () => {
    asTeamLeader('tl-1')
    useSql([[/FROM daily_activity_logs/, [dailyRow]], [/FROM weekly_manual_logs/, [weeklyRow]]])
    const result = await fetchLeadOpsActivityAction('2026-07-20', TODAY)
    expect(result.data?.dailyLogs).toHaveLength(1)
    expect(result.data?.weeklyLogs).toHaveLength(1)
    expect(result.data?.managerLogs).toEqual([])
    expect(callsMatching(/FROM daily_activity_logs/)[0].values).toContain('tl-1')
    expect(callsMatching(/FROM weekly_manual_logs/)[0].values).toContain('tl-1')
    expect(callsMatching(/manager_weekly_log/)).toHaveLength(0)
  })

  it('management and HOD load everyone\'s rows and the manager weekly log', async () => {
    asHod()
    useSql([[/FROM daily_activity_logs/, [dailyRow]], [/FROM weekly_manual_logs/, [weeklyRow]], [/FROM manager_weekly_log/, [managerRow]]])
    const result = await fetchLeadOpsActivityAction('2026-07-20', TODAY)
    expect(result.data?.managerLogs).toEqual([managerRow])
    expect(callsMatching(/FROM daily_activity_logs/)[0].text).not.toContain('tl_id =')
  })

  it('rejects a bad, reversed or oversized window', async () => {
    asManagement()
    expect(await fetchLeadOpsActivityAction('nope', TODAY)).toEqual({ error: 'Invalid date range.' })
    expect(await fetchLeadOpsActivityAction(TODAY, '2026-07-20')).toEqual({ error: 'Invalid date range.' })
    expect(await fetchLeadOpsActivityAction('2024-01-01', TODAY)).toEqual({ error: 'Invalid date range.' })
  })
})

describe('upsertDailyLogAction', () => {
  it('only the team leader themself can write: agents, plain admins, management and other team leaders are refused', async () => {
    for (const as of [asAgent, asPlainAdmin, asManagement, asHod]) {
      as()
      expect(await upsertDailyLogAction(daily())).toEqual({ error: 'Forbidden' })
    }
    asTeamLeader('tl-2')
    expect(await upsertDailyLogAction(daily({ tl_id: 'tl-1' }))).toEqual({ error: 'Forbidden' })
    expect(callsMatching(/INSERT INTO daily_activity_logs/)).toHaveLength(0)
  })

  it('saves today\'s entry for the signed-in team leader and ignores client ids and timestamps', async () => {
    asTeamLeader('tl-1')
    const result = await upsertDailyLogAction(daily())
    expect(result.data?.calls_listened).toBe(5)
    const [insert] = callsMatching(/INSERT INTO daily_activity_logs/)
    expect(insert.values).toContain('tl-1')
    expect(insert.values).toContain(TODAY)
    expect(insert.values).not.toContain('client-id')
    expect(insert.values).not.toContain('client')
  })

  it('saving the same day twice just updates it (upsert on tl_id + date)', async () => {
    asTeamLeader('tl-1')
    expect((await upsertDailyLogAction(daily())).error).toBeUndefined()
    expect((await upsertDailyLogAction(daily({ calls_listened: 9 }))).error).toBeUndefined()
    const inserts = callsMatching(/INSERT INTO daily_activity_logs/)
    expect(inserts).toHaveLength(2)
    expect(inserts[0].text).toContain('ON CONFLICT (tl_id, date)')
  })

  it('refuses yesterday and tomorrow: a day is only editable on the day', async () => {
    asTeamLeader('tl-1')
    const message = { error: 'Daily entries can only be changed on the day.' }
    expect(await upsertDailyLogAction(daily({ date: '2026-10-07' }))).toEqual(message)
    expect(await upsertDailyLogAction(daily({ date: '2026-10-09' }))).toEqual(message)
    expect(callsMatching(/INSERT INTO daily_activity_logs/)).toHaveLength(0)
  })

  it('"today" is the South African day: 23:59 and 00:01 SAST are different days even though both are 21:59-22:01 UTC', async () => {
    asTeamLeader('tl-1')
    jest.setSystemTime(new Date('2026-10-08T21:59:00Z')) // 23:59 SAST on 8 Oct
    expect((await upsertDailyLogAction(daily({ date: '2026-10-08' }))).error).toBeUndefined()
    expect((await upsertDailyLogAction(daily({ date: '2026-10-09' }))).error).toBe('Daily entries can only be changed on the day.')

    jest.setSystemTime(new Date('2026-10-08T22:01:00Z')) // 00:01 SAST on 9 Oct
    expect((await upsertDailyLogAction(daily({ date: '2026-10-09' }))).error).toBeUndefined()
    expect((await upsertDailyLogAction(daily({ date: '2026-10-08' }))).error).toBe('Daily entries can only be changed on the day.')
  })

  it('rejects an impossible date, bad counts and oversized notes', async () => {
    asTeamLeader('tl-1')
    expect(await upsertDailyLogAction(daily({ date: '2026-02-30' }))).toEqual({ error: 'Invalid date.' })
    for (const bad of [-1, 1.5, 10001, Number.NaN]) {
      expect(await upsertDailyLogAction(daily({ calls_listened: bad }))).toEqual({ error: 'Invalid count.' })
    }
    expect(await upsertDailyLogAction(daily({ notes: 'x'.repeat(2001) }))).toEqual({ error: 'Notes are too long.' })
    expect((await upsertDailyLogAction(daily({ notes: 'x'.repeat(2000) }))).error).toBeUndefined()
    expect(callsMatching(/INSERT INTO daily_activity_logs/)).toHaveLength(1)
  })
})

describe('upsertWeeklyLogAction', () => {
  it('only the team leader themself can write', async () => {
    for (const as of [asAgent, asPlainAdmin, asManagement, asHod]) {
      as()
      expect(await upsertWeeklyLogAction(weekly())).toEqual({ error: 'Forbidden' })
    }
    asTeamLeader('tl-2')
    expect(await upsertWeeklyLogAction(weekly({ tl_id: 'tl-1' }))).toEqual({ error: 'Forbidden' })
    expect(callsMatching(/INSERT INTO weekly_manual_logs/)).toHaveLength(0)
  })

  it('saves a Monday week for the signed-in team leader', async () => {
    asTeamLeader('tl-1')
    const result = await upsertWeeklyLogAction(weekly())
    expect(result.data).toEqual(weeklyRow)
    const [insert] = callsMatching(/INSERT INTO weekly_manual_logs/)
    expect(insert.text).toContain('ON CONFLICT (tl_id, week_of)')
    expect(insert.values).toContain('tl-1')
  })

  it('refuses a non-Monday week, an impossible date, a future week and a bad count', async () => {
    asTeamLeader('tl-1')
    expect(await upsertWeeklyLogAction(weekly({ week_of: '2026-10-06' }))).toEqual({ error: 'Invalid week.' })
    expect(await upsertWeeklyLogAction(weekly({ week_of: '2026-02-30' }))).toEqual({ error: 'Invalid week.' })
    expect(await upsertWeeklyLogAction(weekly({ week_of: NEXT_MONDAY }))).toEqual({ error: 'That week has not started yet.' })
    expect(await upsertWeeklyLogAction(weekly({ re_audits: -1 }))).toEqual({ error: 'Invalid count.' })
    expect(callsMatching(/INSERT INTO weekly_manual_logs/)).toHaveLength(0)
  })

  it('a week in the past is still editable (the cutoff applies to daily entries only)', async () => {
    asTeamLeader('tl-1')
    expect((await upsertWeeklyLogAction(weekly({ week_of: '2026-09-07' }))).error).toBeUndefined()
  })
})

describe('upsertManagerWeeklyLogAction', () => {
  it('management and HOD only', async () => {
    for (const as of [asAgent, asPlainAdmin, () => asTeamLeader('tl-1')]) {
      as()
      expect(await upsertManagerWeeklyLogAction(managerWeekly())).toEqual({ error: 'Forbidden' })
    }
    expect(callsMatching(/INSERT INTO manager_weekly_log/)).toHaveLength(0)
  })

  it('is always stored against the configured manager, whatever manager_id the client sends', async () => {
    asManagement()
    await upsertManagerWeeklyLogAction(managerWeekly({ manager_id: 'forged-manager' }))
    const [insert] = callsMatching(/INSERT INTO manager_weekly_log/)
    expect(insert.values).toContain(MANAGER_ID)
    expect(insert.values).not.toContain('forged-manager')
    expect(insert.text).toContain('ON CONFLICT (manager_id, week_of)')
  })

  it('reports a missing manager configuration instead of writing', async () => {
    asHod()
    delete process.env.LEADOPS_MANAGER_EMAIL
    expect(await upsertManagerWeeklyLogAction(managerWeekly())).toEqual({ error: 'leadOps manager and reviewer are not configured.' })
    expect(callsMatching(/INSERT INTO manager_weekly_log/)).toHaveLength(0)
  })

  it('refuses a non-Monday week, a future week and bad counts', async () => {
    asManagement()
    expect(await upsertManagerWeeklyLogAction(managerWeekly({ week_of: '2026-10-06' }))).toEqual({ error: 'Invalid week.' })
    expect(await upsertManagerWeeklyLogAction(managerWeekly({ week_of: NEXT_MONDAY }))).toEqual({ error: 'That week has not started yet.' })
    expect(await upsertManagerWeeklyLogAction(managerWeekly({ interactions_sampled: 1.5 }))).toEqual({ error: 'Invalid count.' })
    expect(await upsertManagerWeeklyLogAction(managerWeekly({ tl_one_on_ones: 10001 }))).toEqual({ error: 'Invalid count.' })
  })
})
