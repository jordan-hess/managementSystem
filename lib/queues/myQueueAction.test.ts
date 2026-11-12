import { sql } from '@/lib/db/pool'
import { requireUser } from '@/lib/auth/requireUser'
import { setMyQueueAction, getQueueHistoryAction } from './actions'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireUser: jest.fn() }))
jest.mock('./notifications', () => ({ notifyQueueAssignment: jest.fn() }))
jest.mock('@/lib/db/tx', () => ({ withTransaction: (fn: (tx: unknown) => unknown) => fn(mockTx) }))

const mockSql = sql as unknown as jest.Mock
const mockTx = jest.fn()
const mockRequireUser = requireUser as jest.Mock

const DATE = '2026-11-01'

type Route = [RegExp, unknown | ((values: unknown[]) => unknown)]
type Call = { text: string; values: unknown[] }

/** Routes by SQL text (first match wins; unmatched queries return []). Records every call. */
function useDb(mock: jest.Mock, routes: Route[]) {
  const calls: Call[] = []
  mock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?')
    calls.push({ text, values })
    for (const [re, result] of routes) {
      if (re.test(text)) return typeof result === 'function' ? (result as (v: unknown[]) => unknown)(values) : result
    }
    return []
  })
  return calls
}

const signedInAs = (userId: string, role: string) =>
  mockRequireUser.mockResolvedValue({ userId, role, t2Team: null, fullName: userId, forcePasswordChange: false })

beforeEach(() => {
  mockSql.mockReset()
  mockTx.mockReset()
  mockRequireUser.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('setMyQueueAction', () => {
  it('setMyQueueAction drops a matching additional', async () => {
    signedInAs('a1', 'agent')
    useDb(mockSql, [[/to_char\(current_date/, [{ d: DATE }]]])
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]],
      // Legacy 'LinkedIn' is the same lane as the combined value picked below.
      [/SELECT queue FROM agent_additional_queues/, [{ queue: 'LinkedIn' }, { queue: 'ODU' }]],
      [/INSERT INTO queue_reassignments/, [{ id: 'log' }]],
    ])
    expect(await setMyQueueAction('TrustPilot & LinkedIn')).toEqual({ data: true })

    const dels = calls.filter((c) => /DELETE FROM agent_additional_queues/.test(c.text))
    expect(dels.map((c) => c.values)).toEqual([['a1', DATE, 'LinkedIn']])
    const logs = calls.filter((c) => /INSERT INTO queue_reassignments/.test(c.text))
    expect(logs).toHaveLength(2)
    expect(logs[0].values).toEqual(expect.arrayContaining(['a1', DATE, 'VOICE', 'TrustPilot & LinkedIn', 'main']))
    expect(logs[1].values).toEqual(expect.arrayContaining(['a1', DATE, 'LinkedIn', null, 'additional']))
    // The main row is written before the clashing additional is dropped.
    const mainWrite = calls.findIndex((c) => /INSERT INTO agent_queue_assignments/.test(c.text))
    expect(mainWrite).toBeGreaterThanOrEqual(0)
    expect(mainWrite).toBeLessThan(calls.indexOf(dels[0]))
  })

  it('keeps additionals when the new main is a removed lane', async () => {
    signedInAs('a1', 'agent')
    useDb(mockSql, [[/to_char\(current_date/, [{ d: DATE }]]])
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_additional_queues/, [{ queue: 'ODU' }]],
      [/INSERT INTO queue_reassignments/, [{ id: 'log' }]],
    ])
    expect(await setMyQueueAction('freescout')).toEqual({ data: true })
    expect(calls.some((c) => /DELETE FROM agent_additional_queues/.test(c.text))).toBe(false)
  })
})

describe('getQueueHistoryAction', () => {
  it('getQueueHistoryAction filters to main rows for mine', async () => {
    signedInAs('tl-1', 'team_leader')
    let calls = useDb(mockSql, [[/FROM queue_reassignments/, [{ kind: 'main' }]]])
    expect(await getQueueHistoryAction({ mine: true })).toEqual({ data: [{ kind: 'main' }] })
    expect(calls.some((c) => /kind = 'main'/.test(c.text))).toBe(true)
    expect(calls.find((c) => /FROM queue_reassignments/.test(c.text))!.text).toMatch(/qr\.kind/)

    calls = useDb(mockSql, [[/FROM queue_reassignments/, []]])
    await getQueueHistoryAction({})
    expect(calls.some((c) => /kind = 'main'/.test(c.text))).toBe(false)
    expect(calls.find((c) => /FROM queue_reassignments/.test(c.text))!.text).toMatch(/qr\.kind/)
  })
})
