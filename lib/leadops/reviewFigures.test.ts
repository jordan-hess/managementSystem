import { sql } from '@/lib/db/pool'
import { loadReviewFigures } from './reviewFigures'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
const mockSql = sql as unknown as jest.Mock

type Route = [RegExp, unknown]
function useSql(routes: Route[]) {
  mockSql.mockImplementation(async (strings: TemplateStringsArray) => {
    const text = strings.join('?')
    for (const [re, result] of routes) if (re.test(text)) return result
    return []
  })
}

beforeEach(() => mockSql.mockReset())

describe('loadReviewFigures', () => {
  it('maps the KPI actuals (numeric strings become numbers) and sums the weekly figures for the month', async () => {
    useSql([
      [/FROM efficiency_scores/, [{
        id: 's1', tl_id: 'tl-1', period: '2026-10-01', metric_key: 'team_sla_adherence', self_value: '91.50', is_na: false, na_reason: null,
        verified_value: null, status: 'self_reported', verified_by: null, verified_at: null, verification_note: null, updated_at: 't',
      }]],
      [/FROM daily_activity_logs/, [
        { coaching_sessions: 2, agent_in_seat: true, critical_fails: 1 },
        { coaching_sessions: 3, agent_in_seat: false, critical_fails: 0 },
        { coaching_sessions: 1, agent_in_seat: true, critical_fails: 2 },
      ]],
      [/FROM weekly_manual_logs/, [
        { calibration: true, re_audits: 4 }, { calibration: false, re_audits: 2 }, { calibration: true, re_audits: 1 },
      ]],
    ])
    const { scores, weekly } = await loadReviewFigures('tl-1', '2026-10-01')
    expect(scores).toHaveLength(1)
    expect(scores[0].self_value).toBe(91.5)
    expect(weekly).toEqual({ weeks: 3, calibrationAttended: 2, coachingSessions: 6, agentInSeatDays: 2, criticalFails: 3, reAudits: 7 })
  })

  it('queries this team leader and this month only, up to (not including) the next month', async () => {
    useSql([])
    await loadReviewFigures('tl-1', '2026-12-01')
    const calls = mockSql.mock.calls.map(([strings, ...values]) => ({ text: (strings as string[]).join('?'), values }))
    const daily = calls.find((c) => /FROM daily_activity_logs/.test(c.text))!
    expect(daily.values).toEqual(expect.arrayContaining(['tl-1', '2026-12-01', '2027-01-01']))
    const weekly = calls.find((c) => /FROM weekly_manual_logs/.test(c.text))!
    expect(weekly.values).toEqual(expect.arrayContaining(['tl-1', '2026-12-01', '2027-01-01']))
    expect(calls.find((c) => /FROM efficiency_scores/.test(c.text))!.values).toEqual(expect.arrayContaining(['tl-1', '2026-12-01']))
  })

  it('returns empty figures when nothing is recorded', async () => {
    useSql([])
    expect(await loadReviewFigures('tl-1', '2026-10-01')).toEqual({
      scores: [],
      weekly: { weeks: 0, calibrationAttended: 0, coachingSessions: 0, agentInSeatDays: 0, criticalFails: 0, reAudits: 0 },
    })
  })
})
