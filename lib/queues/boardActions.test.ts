import { sql } from '@/lib/db/pool'
import { requireUser } from '@/lib/auth/requireUser'
import { notifyQueueAssignment } from './notifications'
import { applyBoardMovesAction, undoBoardChangesAction, type BoardMove } from './actions'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireUser: jest.fn() }))
jest.mock('./notifications', () => ({ notifyQueueAssignment: jest.fn() }))
jest.mock('@/lib/db/tx', () => ({ withTransaction: (fn: (tx: unknown) => unknown) => fn(mockTx) }))

const mockSql = sql as unknown as jest.Mock
const mockTx = jest.fn()
const mockRequireUser = requireUser as jest.Mock
const mockNotify = notifyQueueAssignment as jest.Mock

const DATE = '2026-10-30'

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
  mockNotify.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('applyBoardMovesAction', () => {
  it('forbids an agent', async () => {
    signedInAs('agent-1', 'agent')
    useDb(mockTx, [])
    expect(await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: null, queue: 'VOICE' }])).toEqual({ error: 'Forbidden' })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('rejects an unknown queue and a malformed date without writing', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockTx, [])
    expect('error' in (await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: null, queue: 'NOPE' }]))).toBe(true)
    expect('error' in (await applyBoardMovesAction([{ userId: 'a1', date: '30/10/2026', from: null, queue: 'VOICE' }]))).toBe(true)
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('rejects the batch when any agent is not an active agent', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    useDb(mockTx, [])
    const res = await applyBoardMovesAction([
      { userId: 'a1', date: DATE, from: null, queue: 'VOICE' },
      { userId: 'a2', date: DATE, from: null, queue: 'VOICE' },
    ])
    expect('error' in res).toBe(true)
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('assigns, logs with the reason and returns the change', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    mockNotify.mockResolvedValue('n-1')
    const calls = useDb(mockTx, [[/INSERT INTO queue_reassignments/, [{ id: 'log-1' }]]])
    const res = await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: null, queue: 'VOICE' }], 'Skills match')
    expect(res).toEqual({ data: [{ userId: 'a1', date: DATE, kind: 'main', from: null, queue: 'VOICE', previousQueue: null, logId: 'log-1', notificationId: 'n-1' }] })
    const insert = calls.find((c) => /INSERT INTO queue_reassignments/.test(c.text))!
    expect(insert.values).toContain('Skills match')
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'a1', queue: 'VOICE', date: DATE, days: 1 }))
  })

  it('lets a qa_analyst move an agent', async () => {
    signedInAs('qa-1', 'qa_analyst')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    useDb(mockTx, [[/INSERT INTO queue_reassignments/, [{ id: 'log-1' }]]])
    const res = await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: null, queue: 'VOICE' }])
    expect('data' in res).toBe(true)
  })

  it('skips a move onto the queue the agent already has', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    const calls = useDb(mockTx, [[/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]]])
    const res = await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: 'VOICE', queue: 'VOICE' }])
    expect(res).toEqual({ data: [] })
    expect(calls.some((c) => /INSERT INTO queue_reassignments/.test(c.text))).toBe(false)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('unassigns with a DELETE and a bench audit row', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]],
      [/INSERT INTO queue_reassignments/, [{ id: 'log-2' }]],
    ])
    const res = await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: 'VOICE', queue: null }])
    expect(res).toEqual({ data: [{ userId: 'a1', date: DATE, kind: 'main', from: 'VOICE', queue: null, previousQueue: 'VOICE', logId: 'log-2', notificationId: null }] })
    expect(calls.some((c) => /DELETE FROM agent_queue_assignments/.test(c.text))).toBe(true)
    const insert = calls.find((c) => /INSERT INTO queue_reassignments/.test(c.text))!
    expect(insert.values).toContain('VOICE')
    expect(insert.values).toContain(null)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('sends one notification per agent for a multi-date batch and tags every change with it', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }, { id: 'a2' }]]])
    useDb(mockTx, [
      // a1 is on VOICE on the 4th, so the bench move there is a real change.
      [/SELECT queue FROM agent_queue_assignments/, (v: unknown[]) => (v[1] === '2026-11-04' ? [{ queue: 'VOICE' }] : [])],
      [/INSERT INTO queue_reassignments/, [{ id: 'log' }]],
    ])
    mockNotify.mockImplementation(async ({ agentId }: { agentId: string }) => `n-${agentId}`)
    const res = await applyBoardMovesAction([
      { userId: 'a1', date: '2026-11-03', from: null, queue: 'VOICE' },
      { userId: 'a1', date: '2026-11-02', from: null, queue: 'PORTING' },
      { userId: 'a1', date: '2026-11-04', from: 'VOICE', queue: null },
      { userId: 'a2', date: '2026-11-02', from: null, queue: 'ODU' },
      { userId: 'a2', date: '2026-11-03', from: null, queue: 'ODU' },
    ], "Copied from today's plan")
    expect(mockNotify).toHaveBeenCalledTimes(2)
    // a1's queues differ across days, so the summary names no single queue.
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'a1', queue: null, date: '2026-11-02', days: 2 }))
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'a2', queue: 'ODU', date: '2026-11-02', days: 2 }))
    expect(res.data?.map((c) => [c.userId, c.notificationId])).toEqual([
      ['a1', 'n-a1'], ['a1', 'n-a1'], ['a1', 'n-a1'], ['a2', 'n-a2'], ['a2', 'n-a2'],
    ])
  })

  it('does not notify an agent whose only moves are to the bench', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }, { id: 'a2' }]]])
    useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, (v: unknown[]) => (v[0] === 'a1' ? [{ queue: 'VOICE' }] : [])],
      [/INSERT INTO queue_reassignments/, [{ id: 'log' }]],
    ])
    mockNotify.mockResolvedValue('n-1')
    const res = await applyBoardMovesAction([
      { userId: 'a1', date: DATE, from: 'VOICE', queue: null },
      { userId: 'a2', date: DATE, from: null, queue: 'ODU' },
    ])
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'a2', queue: 'ODU', date: DATE, days: 1 }))
    expect(res.data?.map((c) => [c.userId, c.notificationId])).toEqual([['a1', null], ['a2', 'n-1']])
  })

  it('rejects the whole batch when the client view is stale, writing nothing', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }, { id: 'a2' }]]])
    // Another lead put a2 on VOICE after this client last saw the board.
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, (v: unknown[]) => (v[0] === 'a2' ? [{ queue: 'VOICE' }] : [])],
    ])
    const res = await applyBoardMovesAction([
      { userId: 'a1', date: DATE, from: null, queue: 'ODU' },
      { userId: 'a2', date: DATE, from: null, queue: 'PORTING' },
    ], 'Auto-fill')
    expect(res).toEqual({ error: 'Someone else has changed this board since. Refresh and try again.' })
    // a1's write happened in the same transaction, which the throw rolls back;
    // a2's was never attempted.
    expect(calls.filter((c) => /INSERT INTO agent_queue_assignments/.test(c.text)).map((c) => c.values[0])).toEqual(['a1'])
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('proceeds when from matches the current queue, reading it FOR UPDATE', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]],
      [/INSERT INTO queue_reassignments/, [{ id: 'log-3' }]],
    ])
    const res = await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: 'VOICE', queue: 'PORTING' }])
    expect(res.data).toEqual([expect.objectContaining({ queue: 'PORTING', previousQueue: 'VOICE', logId: 'log-3' })])
    expect(calls[0].text).toMatch(/SELECT queue FROM agent_queue_assignments[\s\S]*FOR UPDATE/)
  })

  it('rejects a from outside ASSIGNABLE_QUEUES, or a missing from', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    useDb(mockTx, [])
    expect('error' in (await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: 'NOPE', queue: 'VOICE' }]))).toBe(true)
    const noFrom = { userId: 'a1', date: DATE, queue: 'VOICE' } as unknown as BoardMove
    expect('error' in (await applyBoardMovesAction([noFrom]))).toBe(true)
    expect(mockTx).not.toHaveBeenCalled()
  })
})

describe('applyBoardMovesAction: additional platforms', () => {
  const MAIN = /SELECT queue FROM agent_queue_assignments/
  const ADDITIONAL = /SELECT queue FROM agent_additional_queues/
  const STALE = 'Someone else has changed this board since. Refresh and try again.'

  it('adds an additional platform and logs kind additional', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    mockNotify.mockResolvedValue('n-1')
    const calls = useDb(mockTx, [
      [MAIN, [{ queue: 'VOICE' }]],
      [ADDITIONAL, []],
      [/INSERT INTO queue_reassignments/, [{ id: 'log-a' }]],
    ])
    const res = await applyBoardMovesAction([{ userId: 'a1', date: DATE, kind: 'additional', from: null, queue: 'Dark posts' }])
    expect(res).toEqual({ data: [{ userId: 'a1', date: DATE, kind: 'additional', from: null, queue: 'Dark posts', previousQueue: null, logId: 'log-a', notificationId: 'n-1' }] })
    const ins = calls.find((c) => /INSERT INTO agent_additional_queues/.test(c.text))!
    expect(ins.values).toEqual(['a1', DATE, 'Dark posts', 'tl-1'])
    const log = calls.find((c) => /INSERT INTO queue_reassignments/.test(c.text))!
    expect(log.values).toEqual(expect.arrayContaining(['a1', DATE, null, 'Dark posts', 'tl-1', 'additional']))
    // The main channel is untouched.
    expect(calls.some((c) => /INSERT INTO agent_queue_assignments|DELETE FROM agent_queue_assignments/.test(c.text))).toBe(false)
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'a1', queue: 'Dark posts', date: DATE, days: 1 }))
  })

  it('refuses a third additional', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    const calls = useDb(mockTx, [
      [MAIN, [{ queue: 'VOICE' }]],
      [ADDITIONAL, [{ queue: 'Dark posts' }, { queue: 'ODU' }]],
    ])
    expect(await applyBoardMovesAction([{ userId: 'a1', date: DATE, kind: 'additional', from: null, queue: 'TikTok' }])).toEqual({ error: 'Already on 3 channels' })
    expect(calls.some((c) => /INSERT/.test(c.text))).toBe(false)
  })

  it('refuses an additional on the main lane, a legacy-equivalent lane, or without a main', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    const add = (queue: string) => applyBoardMovesAction([{ userId: 'a1', date: DATE, kind: 'additional', from: null, queue }])

    let calls = useDb(mockTx, [[MAIN, [{ queue: 'VOICE' }]], [ADDITIONAL, []]])
    expect(await add('VOICE')).toEqual({ error: 'They already cover that channel.' })
    expect(calls.some((c) => /INSERT/.test(c.text))).toBe(false)

    calls = useDb(mockTx, [[MAIN, [{ queue: 'LinkedIn' }]], [ADDITIONAL, []]])
    expect(await add('TrustPilot & LinkedIn')).toEqual({ error: 'They already cover that channel.' })
    expect(calls.some((c) => /INSERT/.test(c.text))).toBe(false)

    // Another additional already covers the combined lane.
    calls = useDb(mockTx, [[MAIN, [{ queue: 'VOICE' }]], [ADDITIONAL, [{ queue: 'TrustPilot' }]]])
    expect(await add('TrustPilot & LinkedIn')).toEqual({ error: 'They already cover that channel.' })
    expect(calls.some((c) => /INSERT/.test(c.text))).toBe(false)

    // A removed lane is not on the board at all.
    calls = useDb(mockTx, [[MAIN, [{ queue: 'VOICE' }]], [ADDITIONAL, []]])
    expect(await add('Reddit')).toEqual({ error: 'They already cover that channel.' })
    expect(calls.some((c) => /INSERT/.test(c.text))).toBe(false)

    calls = useDb(mockTx, [[MAIN, []], [ADDITIONAL, []]])
    expect(await add('Dark posts')).toEqual({ error: 'Give them a main channel first.' })
    expect(calls.some((c) => /INSERT/.test(c.text))).toBe(false)
  })

  it('refuses a stale additional from', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    const calls = useDb(mockTx, [[MAIN, [{ queue: 'VOICE' }]], [ADDITIONAL, [{ queue: 'ODU' }]]])
    expect(await applyBoardMovesAction([{ userId: 'a1', date: DATE, kind: 'additional', from: 'Dark posts', queue: null }])).toEqual({ error: STALE })
    expect(calls.some((c) => /DELETE|INSERT/.test(c.text))).toBe(false)
  })

  it('moves and removes an additional, locking the main row first', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    mockNotify.mockResolvedValue('n-1')
    const calls = useDb(mockTx, [
      [MAIN, [{ queue: 'VOICE' }]],
      [ADDITIONAL, [{ queue: 'ODU' }]],
      [/INSERT INTO queue_reassignments/, [{ id: 'log-m' }]],
    ])
    const res = await applyBoardMovesAction([{ userId: 'a1', date: DATE, kind: 'additional', from: 'ODU', queue: 'TikTok' }])
    expect(res.data).toEqual([expect.objectContaining({ kind: 'additional', from: 'ODU', queue: 'TikTok', previousQueue: 'ODU', logId: 'log-m' })])
    expect(calls[0].text).toMatch(/SELECT queue FROM agent_queue_assignments[\s\S]*FOR UPDATE/)
    expect(calls[1].text).toMatch(/SELECT queue FROM agent_additional_queues/)
    expect(calls.find((c) => /DELETE FROM agent_additional_queues/.test(c.text))!.values).toContain('ODU')
    expect(calls.find((c) => /INSERT INTO agent_additional_queues/.test(c.text))!.values).toContain('TikTok')
    const log = calls.find((c) => /INSERT INTO queue_reassignments/.test(c.text))!
    expect(log.values).toEqual(expect.arrayContaining(['ODU', 'TikTok', 'additional']))

    // A removal needs no lane checks and, like a bench move, notifies nobody.
    mockNotify.mockClear()
    const removeCalls = useDb(mockTx, [
      [MAIN, [{ queue: 'VOICE' }]],
      [ADDITIONAL, [{ queue: 'ODU' }]],
      [/INSERT INTO queue_reassignments/, [{ id: 'log-r' }]],
    ])
    const removed = await applyBoardMovesAction([{ userId: 'a1', date: DATE, kind: 'additional', from: 'ODU', queue: null }])
    expect(removed.data).toEqual([expect.objectContaining({ kind: 'additional', from: 'ODU', queue: null, previousQueue: 'ODU', notificationId: null })])
    expect(removeCalls.some((c) => /INSERT INTO agent_additional_queues/.test(c.text))).toBe(false)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('accepts a legacy from value', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    useDb(mockTx, [
      [MAIN, [{ queue: 'LinkedIn' }]],
      [ADDITIONAL, []],
      [/INSERT INTO queue_reassignments/, [{ id: 'log-l' }]],
    ])
    const res = await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: 'LinkedIn', queue: 'ODU' }])
    expect(res.data).toEqual([expect.objectContaining({ kind: 'main', from: 'LinkedIn', queue: 'ODU', previousQueue: 'LinkedIn' })])
  })

  it('main move onto an additional lane drops it', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    const calls = useDb(mockTx, [
      [MAIN, [{ queue: 'VOICE' }]],
      // Stored as the legacy 'LinkedIn', which is still the combined lane.
      [ADDITIONAL, [{ queue: 'LinkedIn' }, { queue: 'ODU' }]],
      [/INSERT INTO queue_reassignments/, (v: unknown[]) => [{ id: v.includes('additional') ? 'log-add' : 'log-main' }]],
    ])
    const res = await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: 'VOICE', queue: 'TrustPilot & LinkedIn' }], 'Cover')
    expect(res.data).toEqual([
      expect.objectContaining({ kind: 'main', from: 'VOICE', queue: 'TrustPilot & LinkedIn', previousQueue: 'VOICE', logId: 'log-main' }),
      expect.objectContaining({ kind: 'additional', from: 'LinkedIn', queue: null, previousQueue: 'LinkedIn', logId: 'log-add' }),
    ])
    const dels = calls.filter((c) => /DELETE FROM agent_additional_queues/.test(c.text))
    expect(dels).toHaveLength(1)
    expect(dels[0].values).toContain('LinkedIn')
    // The dropped additional is audited without the batch reason.
    const addLog = calls.find((c) => /INSERT INTO queue_reassignments/.test(c.text) && c.values.includes('additional'))!
    expect(addLog.values).not.toContain('Cover')
  })

  it('sending the main to the bench removes every additional', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    const calls = useDb(mockTx, [
      [MAIN, [{ queue: 'VOICE' }]],
      [ADDITIONAL, [{ queue: 'Dark posts' }, { queue: 'ODU' }]],
      [/INSERT INTO queue_reassignments/, [{ id: 'log' }]],
    ])
    const res = await applyBoardMovesAction([{ userId: 'a1', date: DATE, from: 'VOICE', queue: null }])
    expect(res.data?.map((c) => [c.kind, c.from, c.queue])).toEqual([
      ['main', 'VOICE', null],
      ['additional', 'Dark posts', null],
      ['additional', 'ODU', null],
    ])
    expect(calls.filter((c) => /DELETE FROM agent_additional_queues/.test(c.text)).map((c) => c.values[2])).toEqual(['Dark posts', 'ODU'])
    expect(calls.filter((c) => /INSERT INTO queue_reassignments/.test(c.text))).toHaveLength(3)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('allows a main and an additional move for the same agent and day in one batch', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    mockNotify.mockResolvedValue('n-1')
    useDb(mockTx, [
      [MAIN, [{ queue: 'VOICE' }]],
      [ADDITIONAL, []],
      [/INSERT INTO queue_reassignments/, [{ id: 'log' }]],
    ])
    const res = await applyBoardMovesAction([
      { userId: 'a1', date: DATE, from: 'VOICE', queue: 'PORTING' },
      { userId: 'a1', date: DATE, kind: 'additional', from: null, queue: 'Dark posts' },
    ])
    expect(res.data?.map((c) => [c.kind, c.queue, c.notificationId])).toEqual([
      ['main', 'PORTING', 'n-1'],
      ['additional', 'Dark posts', 'n-1'],
    ])
    // One summary for the agent; two different queues, so none is named.
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'a1', queue: null, additional: false }))
  })

  it('flags an additional-only add so the agent is told it is an additional platform', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    mockNotify.mockResolvedValue('n-2')
    useDb(mockTx, [
      [MAIN, [{ queue: 'VOICE' }]],
      [ADDITIONAL, []],
      [/INSERT INTO queue_reassignments/, [{ id: 'log' }]],
    ])
    await applyBoardMovesAction([{ userId: 'a1', date: DATE, kind: 'additional', from: null, queue: 'Dark posts' }])
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'a1', queue: 'Dark posts', additional: true }))
  })

  it('rejects a duplicate additional key or an unknown kind', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockTx, [])
    expect('error' in (await applyBoardMovesAction([
      { userId: 'a1', date: DATE, kind: 'additional', from: null, queue: 'ODU' },
      { userId: 'a1', date: DATE, kind: 'additional', from: 'ODU', queue: 'TikTok' },
    ]))).toBe(true)
    const odd = { userId: 'a1', date: DATE, kind: 'extra', from: null, queue: 'ODU' } as unknown as BoardMove
    expect('error' in (await applyBoardMovesAction([odd]))).toBe(true)
    expect(mockTx).not.toHaveBeenCalled()
  })
})

describe('undoBoardChangesAction', () => {
  const change = { userId: 'a1', date: DATE, from: 'PORTING', queue: 'VOICE', previousQueue: 'PORTING', logId: 'log-1', notificationId: null as string | null }

  it('restores the previous queue and deletes only my log row', async () => {
    signedInAs('tl-1', 'team_leader')
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]],
      [/DELETE FROM queue_reassignments/, [{ id: 'log-1' }]],
    ])
    expect(await undoBoardChangesAction([change])).toEqual({ data: true })
    expect(calls.some((c) => /INSERT INTO agent_queue_assignments/.test(c.text))).toBe(true)
    const del = calls.find((c) => /DELETE FROM queue_reassignments/.test(c.text))!
    expect(del.values).toEqual(expect.arrayContaining(['log-1', 'tl-1']))
    expect(calls[0].text).toMatch(/SELECT queue FROM agent_queue_assignments[\s\S]*FOR UPDATE/)
  })

  it('refuses when the agent has moved since', async () => {
    signedInAs('tl-1', 'team_leader')
    const calls = useDb(mockTx, [[/SELECT queue FROM agent_queue_assignments/, [{ queue: 'PORTING' }]]])
    expect(await undoBoardChangesAction([change])).toEqual({
      error: 'Someone else has changed this board since. Refresh and try again.',
    })
    expect(calls.some((c) => /INSERT INTO agent_queue_assignments|DELETE FROM/.test(c.text))).toBe(false)
  })

  it('rejects a change without a logId', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockTx, [])
    expect('error' in (await undoBoardChangesAction([{ ...change, logId: null }]))).toBe(true)
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('rejects a previousQueue outside ASSIGNABLE_QUEUES', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockTx, [])
    expect('error' in (await undoBoardChangesAction([{ ...change, previousQueue: 'ANYTHING' }]))).toBe(true)
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('rejects when the log row does not match', async () => {
    signedInAs('tl-1', 'team_leader')
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]],
      [/DELETE FROM queue_reassignments/, []],
    ])
    expect(await undoBoardChangesAction([change])).toEqual({
      error: 'Someone else has changed this board since. Refresh and try again.',
    })
    expect(calls.some((c) => /INSERT INTO agent_queue_assignments|DELETE FROM agent_queue_assignments/.test(c.text))).toBe(false)
  })

  it('undo of a bench change re-inserts the previous queue', async () => {
    signedInAs('tl-1', 'team_leader')
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, []],
      [/DELETE FROM queue_reassignments/, [{ id: 'log-2' }]],
    ])
    const res = await undoBoardChangesAction([{ userId: 'a1', date: DATE, from: 'VOICE', queue: null, previousQueue: 'VOICE', logId: 'log-2', notificationId: null }])
    expect(res).toEqual({ data: true })
    const ins = calls.find((c) => /INSERT INTO agent_queue_assignments/.test(c.text))!
    expect(ins.values).toContain('VOICE')
  })

  it("retracts the batch's notifications, bound to the agent and to me as sender", async () => {
    signedInAs('tl-1', 'team_leader')
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, (v: unknown[]) => [{ queue: v[1] === DATE ? 'VOICE' : 'ODU' }]],
      [/DELETE FROM queue_reassignments/, (v: unknown[]) => [{ id: v[0] }]],
    ])
    const res = await undoBoardChangesAction([
      { ...change, notificationId: 'n-1' },
      { userId: 'a1', date: '2026-10-31', from: null, queue: 'ODU', previousQueue: null, logId: 'log-2', notificationId: 'n-1' },
    ])
    expect(res).toEqual({ data: true })
    const dels = calls.filter((c) => /DELETE FROM notifications/.test(c.text))
    expect(dels).toHaveLength(1)
    expect(dels[0].text).toMatch(/type = 'queue_assignment'/)
    expect(dels[0].text).toMatch(/sender_id = \?/)
    expect(dels[0].text).toMatch(/recipient_id = \?/)
    expect(dels[0].values).toEqual(expect.arrayContaining([['n-1'], 'a1', 'tl-1']))
  })

  it('a notification that is already gone does not fail the undo', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]],
      [/DELETE FROM queue_reassignments/, [{ id: 'log-1' }]],
      [/DELETE FROM notifications/, []],
    ])
    expect(await undoBoardChangesAction([{ ...change, notificationId: 'n-gone' }])).toEqual({ data: true })
  })

  it('issues no notification DELETE when the batch notified nobody', async () => {
    signedInAs('tl-1', 'team_leader')
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]],
      [/DELETE FROM queue_reassignments/, [{ id: 'log-1' }]],
    ])
    expect(await undoBoardChangesAction([{ ...change, notificationId: null }])).toEqual({ data: true })
    expect(calls.some((c) => /DELETE FROM notifications/.test(c.text))).toBe(false)
  })

  it('rejects a notificationId that is not a string or null', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockTx, [])
    expect('error' in (await undoBoardChangesAction([{ ...change, notificationId: 42 as unknown as string }]))).toBe(true)
    expect(mockTx).not.toHaveBeenCalled()
  })
})

describe('undoBoardChangesAction: additional platforms', () => {
  it('undo restores main before additionals', async () => {
    signedInAs('tl-1', 'team_leader')
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, []],
      [/SELECT queue FROM agent_additional_queues/, []],
      [/DELETE FROM queue_reassignments/, (v: unknown[]) => [{ id: v[0] }]],
    ])
    const res = await undoBoardChangesAction([
      { userId: 'a1', date: DATE, kind: 'main', from: 'VOICE', queue: null, previousQueue: 'VOICE', logId: 'log-1', notificationId: null },
      { userId: 'a1', date: DATE, kind: 'additional', from: 'Dark posts', queue: null, previousQueue: 'Dark posts', logId: 'log-2', notificationId: null },
    ])
    expect(res).toEqual({ data: true })
    const writes = calls.map((c) => c.text).filter((t) => /INSERT INTO agent_(queue_assignments|additional_queues)/.test(t))
    expect(writes).toHaveLength(2)
    expect(writes[0]).toMatch(/INSERT INTO agent_queue_assignments/)
    expect(writes[1]).toMatch(/INSERT INTO agent_additional_queues/)
    const logDels = calls.filter((c) => /DELETE FROM queue_reassignments/.test(c.text))
    expect(logDels.map((c) => c.values[0])).toEqual(['log-1', 'log-2'])
    expect(logDels[0].text).toMatch(/kind = 'main'/)
    expect(logDels[1].text).toMatch(/kind = 'additional'/)
    // An undo never writes a new audit row.
    expect(calls.some((c) => /INSERT INTO queue_reassignments/.test(c.text))).toBe(false)
  })

  it('undoes additional changes in reverse, so a moved-then-dropped platform comes back', async () => {
    signedInAs('tl-1', 'team_leader')
    // The batch was: additional ODU -> TikTok, then main VOICE -> TikTok (which dropped it).
    let main = 'TikTok'
    let additionals: string[] = []
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, () => [{ queue: main }]],
      [/SELECT queue FROM agent_additional_queues/, () => additionals.map((queue) => ({ queue }))],
      [/DELETE FROM queue_reassignments/, (v: unknown[]) => [{ id: v[0] }]],
      [/DELETE FROM agent_additional_queues/, (v: unknown[]) => { additionals = additionals.filter((q) => q !== v[2]); return [] }],
      [/INSERT INTO agent_additional_queues/, (v: unknown[]) => { additionals = [...additionals, v[2] as string]; return [] }],
      [/INSERT INTO agent_queue_assignments/, (v: unknown[]) => { main = v[2] as string; return [] }],
    ])
    const res = await undoBoardChangesAction([
      { userId: 'a1', date: DATE, kind: 'additional', from: 'ODU', queue: 'TikTok', previousQueue: 'ODU', logId: 'log-1', notificationId: null },
      { userId: 'a1', date: DATE, kind: 'main', from: 'VOICE', queue: 'TikTok', previousQueue: 'VOICE', logId: 'log-2', notificationId: null },
      { userId: 'a1', date: DATE, kind: 'additional', from: 'TikTok', queue: null, previousQueue: 'TikTok', logId: 'log-3', notificationId: null },
    ])
    expect(res).toEqual({ data: true })
    expect(main).toBe('VOICE')
    expect(additionals).toEqual(['ODU'])
    expect(calls.some((c) => /INSERT INTO queue_reassignments/.test(c.text))).toBe(false)
  })

  it('refuses to undo an additional change that is no longer current', async () => {
    signedInAs('tl-1', 'team_leader')
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]],
      // Someone else already removed the Dark posts this batch added.
      [/SELECT queue FROM agent_additional_queues/, []],
    ])
    expect(await undoBoardChangesAction([
      { userId: 'a1', date: DATE, kind: 'additional', from: null, queue: 'Dark posts', previousQueue: null, logId: 'log-1', notificationId: null },
    ])).toEqual({ error: 'Someone else has changed this board since. Refresh and try again.' })
    expect(calls.some((c) => /DELETE|INSERT/.test(c.text))).toBe(false)
  })

  const STALE = { error: 'Someone else has changed this board since. Refresh and try again.' }
  const removedDarkPosts = { userId: 'a1', date: DATE, kind: 'additional' as const, from: 'Dark posts', queue: null, previousQueue: 'Dark posts', logId: 'log-1', notificationId: null }

  it('refuses to restore a removed additional once the agent is at the limit again', async () => {
    signedInAs('tl-1', 'team_leader')
    // Another lead filled the freed slot since.
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]],
      [/SELECT queue FROM agent_additional_queues/, [{ queue: 'ODU' }, { queue: 'TikTok' }]],
      [/DELETE FROM queue_reassignments/, [{ id: 'log-1' }]],
    ])
    expect(await undoBoardChangesAction([removedDarkPosts])).toEqual(STALE)
    expect(calls.some((c) => /DELETE|INSERT/.test(c.text))).toBe(false)
  })

  it('refuses to restore a removed additional whose lane is now covered (legacy-equivalent value)', async () => {
    signedInAs('tl-1', 'team_leader')
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'VOICE' }]],
      [/SELECT queue FROM agent_additional_queues/, [{ queue: 'TrustPilot & LinkedIn' }]],
      [/DELETE FROM queue_reassignments/, [{ id: 'log-1' }]],
    ])
    expect(await undoBoardChangesAction([
      { ...removedDarkPosts, from: 'TrustPilot', previousQueue: 'TrustPilot' },
    ])).toEqual(STALE)
    expect(calls.some((c) => /DELETE|INSERT/.test(c.text))).toBe(false)
  })

  it('refuses a main undo when the restored main lane is now one of their additionals', async () => {
    signedInAs('tl-1', 'team_leader')
    // VOICE -> PORTING, then another lead added VOICE as an additional.
    const calls = useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, [{ queue: 'PORTING' }]],
      [/SELECT queue FROM agent_additional_queues/, [{ queue: 'VOICE' }]],
      [/DELETE FROM queue_reassignments/, [{ id: 'log-1' }]],
    ])
    expect(await undoBoardChangesAction([
      { userId: 'a1', date: DATE, kind: 'main', from: 'VOICE', queue: 'PORTING', previousQueue: 'VOICE', logId: 'log-1', notificationId: null },
    ])).toEqual(STALE)
    expect(calls.some((c) => /DELETE|INSERT/.test(c.text))).toBe(false)
  })

  it('rejects the same log id twice', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockTx, [])
    expect('error' in (await undoBoardChangesAction([removedDarkPosts, { ...removedDarkPosts, from: 'ODU', previousQueue: 'ODU' }]))).toBe(true)
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('accepts and replays what apply returned for [add X, main to the bench]', async () => {
    signedInAs('tl-1', 'team_leader')
    useDb(mockSql, [[/FROM profiles/, [{ id: 'a1' }]]])
    // A tiny stateful stand-in for the agent's day, shared by apply and undo.
    let main: string | null = 'VOICE'
    let additionals: string[] = []
    let logs = 0
    useDb(mockTx, [
      [/SELECT queue FROM agent_queue_assignments/, () => (main ? [{ queue: main }] : [])],
      [/SELECT queue FROM agent_additional_queues/, () => additionals.map((queue) => ({ queue }))],
      [/INSERT INTO agent_queue_assignments/, (v: unknown[]) => { main = v[2] as string; return [] }],
      [/DELETE FROM agent_queue_assignments/, () => { main = null; return [] }],
      [/INSERT INTO agent_additional_queues/, (v: unknown[]) => { additionals = [...additionals, v[2] as string]; return [] }],
      [/DELETE FROM agent_additional_queues/, (v: unknown[]) => { additionals = additionals.filter((q) => q !== v[2]); return [] }],
      [/INSERT INTO queue_reassignments/, () => [{ id: `log-${++logs}` }]],
      [/DELETE FROM queue_reassignments/, (v: unknown[]) => [{ id: v[0] }]],
    ])
    const applied = await applyBoardMovesAction([
      { userId: 'a1', date: DATE, kind: 'additional', from: null, queue: 'Dark posts' },
      { userId: 'a1', date: DATE, from: 'VOICE', queue: null },
    ])
    expect(applied.data?.map((c) => [c.kind, c.from, c.queue])).toEqual([
      ['additional', null, 'Dark posts'],
      ['main', 'VOICE', null],
      ['additional', 'Dark posts', null],
    ])
    expect([main, additionals]).toEqual([null, []])

    expect(await undoBoardChangesAction(applied.data!)).toEqual({ data: true })
    expect([main, additionals]).toEqual(['VOICE', []])
  })
})
