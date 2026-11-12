import { sql } from '@/lib/db/pool'
import { requireActiveUser } from '@/lib/auth/requireUser'
import { isSubmitterTeamLeader } from '@/lib/auth/authz'
import { resolveRosterShift } from './rosterShiftResolve'
import { fetchLeadOpsPlannerAction, savePlannerDayAction } from './plannerActions'
import { PLANNER_MESSAGES as M } from './plannerLimits'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireActiveUser: jest.fn() }))
jest.mock('@/lib/auth/authz', () => ({ isSubmitterTeamLeader: jest.fn() }))
jest.mock('./rosterShiftResolve', () => ({ resolveRosterShift: jest.fn() }))
jest.mock('@/lib/db/tx', () => ({ withTransaction: (fn: (tx: unknown) => unknown) => fn(mockTx) }))

const mockSql = sql as unknown as jest.Mock
const mockTx = jest.fn()
const mockRequireActiveUser = requireActiveUser as jest.Mock
const mockIsTeamLeader = isSubmitterTeamLeader as jest.Mock
const mockResolveShift = resolveRosterShift as jest.Mock

const DATE = '2026-10-08'
const EARLY = { data: { kind: 'early', startTime: '08:00:00', endTime: '17:00:00' } }

type Route = [RegExp, unknown | ((values: unknown[]) => unknown)]

/** Routes by SQL text (first match wins; unmatched queries return []). */
function useSql(routes: Route[]) {
  mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?')
    for (const [re, result] of routes) {
      if (re.test(text)) return typeof result === 'function' ? (result as (v: unknown[]) => unknown)(values) : result
    }
    return []
  })
}

function signedInAs(userId: string, role: string, hasTeamRow = false) {
  mockRequireActiveUser.mockResolvedValue({ userId, role, t2Team: null, fullName: userId, forcePasswordChange: false })
  mockIsTeamLeader.mockResolvedValue(hasTeamRow)
}
const asTeamLeader = (id = 'tl-1') => signedInAs(id, 'admin', true)
const asManagement = () => signedInAs('mgmt-1', 'management')
const asHod = () => signedInAs('hod-1', 'hod')
const asPlainAdmin = () => signedInAs('admin-1', 'admin')
const asAgent = () => signedInAs('agent-1', 'agent')

const LOG_ROW = {
  id: 'l1', tl_id: 'tl-1', date: DATE, template_block_id: 'tpl-early-b2', status: 'moved', actual_minutes: 45,
  actual_category: 'operations', actual_activity: 'Covered', reason: 'Spike', updated_at: 't',
}
const UNPLANNED_ROW = {
  id: 'u1', tl_id: 'tl-1', date: DATE, category: 'escalations', minutes: 20, reason: 'Escalation', displaced_block_id: null, created_at: 't',
}

beforeEach(() => {
  mockSql.mockReset()
  mockTx.mockReset()
  mockRequireActiveUser.mockReset()
  mockIsTeamLeader.mockReset()
  mockResolveShift.mockReset()
  mockResolveShift.mockResolvedValue(EARLY)
  jest.useFakeTimers({ now: new Date('2026-10-08T10:00:00Z') }) // 12:00 in South Africa
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('fetchLeadOpsPlannerAction — who may read', () => {
  const real = [[/FROM team_leaders/, [{ one: 1 }]]] as Route[]

  it('lets a team leader read their own day', async () => {
    asTeamLeader('tl-1')
    useSql(real)
    expect(await fetchLeadOpsPlannerAction('tl-1', DATE)).toEqual({ data: { revision: 0, logs: [], unplanned: [], rosterMismatch: false } })
  })
  it('lets management and HOD read any real team leader', async () => {
    useSql(real)
    asManagement()
    expect('data' in (await fetchLeadOpsPlannerAction('tl-2', DATE))).toBe(true)
    asHod()
    expect('data' in (await fetchLeadOpsPlannerAction('tl-2', DATE))).toBe(true)
  })
  it('refuses a team leader reading another team leader, without touching the database', async () => {
    asTeamLeader('tl-1')
    useSql(real)
    expect(await fetchLeadOpsPlannerAction('tl-2', DATE)).toEqual({ error: 'Forbidden' })
    expect(mockSql).not.toHaveBeenCalled()
  })
  it.each([['a plain admin', asPlainAdmin], ['an agent', asAgent]])('refuses %s', async (_n, as) => {
    as()
    useSql(real)
    expect(await fetchLeadOpsPlannerAction('tl-1', DATE)).toEqual({ error: 'Forbidden' })
    expect(mockSql).not.toHaveBeenCalled()
  })
  it('refuses a target that is not a real team leader, returning no data', async () => {
    asManagement()
    useSql([[/FROM team_leaders/, []]])
    expect(await fetchLeadOpsPlannerAction('someone-else', DATE)).toEqual({ error: 'Invalid team leader.' })
  })
  it.each([[''], [undefined], [null], [42]])('refuses a non-string or empty target (%p) without querying', async (bad) => {
    asManagement()
    useSql(real)
    expect(await fetchLeadOpsPlannerAction(bad as unknown as string, DATE)).toEqual({ error: 'Invalid team leader.' })
    expect(mockSql).not.toHaveBeenCalled()
  })
  it('maps a Postgres invalid-uuid error to Invalid team leader without logging an outage', async () => {
    asManagement()
    mockSql.mockRejectedValue(Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' }))
    expect(await fetchLeadOpsPlannerAction('not-a-uuid', DATE)).toEqual({ error: 'Invalid team leader.' })
    expect(console.error).not.toHaveBeenCalled()
  })
  it('rejects a malformed date before touching the database', async () => {
    asManagement()
    useSql(real)
    expect(await fetchLeadOpsPlannerAction('tl-1', 'not-a-date')).toEqual({ error: 'Invalid date.' })
    expect(mockSql).not.toHaveBeenCalled()
  })
})

describe('fetchLeadOpsPlannerAction — the day', () => {
  it('returns the revision and the stored rows, mapped', async () => {
    asTeamLeader('tl-1')
    useSql([
      [/FROM team_leaders/, [{ one: 1 }]],
      [/FROM planner_days/, [{ revision: 3 }]],
      [/FROM planner_block_logs/, [LOG_ROW]],
      [/FROM planner_unplanned_entries/, [UNPLANNED_ROW]],
    ])
    const result = await fetchLeadOpsPlannerAction('tl-1', DATE)
    expect(result.data).toEqual({
      revision: 3,
      rosterMismatch: false,
      logs: [{ ...LOG_ROW }],
      unplanned: [{ ...UNPLANNED_ROW }],
    })
  })

  it('flags a roster mismatch when a saved block no longer belongs to the shift the roster resolves', async () => {
    asTeamLeader('tl-1')
    mockResolveShift.mockResolvedValue({ data: { kind: 'late', startTime: '11:00:00', endTime: '20:00:00' } })
    useSql([
      [/FROM team_leaders/, [{ one: 1 }]],
      [/FROM planner_days/, [{ revision: 1 }]],
      [/FROM planner_block_logs/, [LOG_ROW]], // tpl-early-b2
      [/FROM planner_unplanned_entries/, []],
    ])
    const result = await fetchLeadOpsPlannerAction('tl-1', DATE)
    expect(result.data?.rosterMismatch).toBe(true)
    expect(result.data?.logs).toHaveLength(1) // the saved rows are returned untouched
  })

  it('flags a mismatch when blocks are saved but the roster now says off', async () => {
    asTeamLeader('tl-1')
    mockResolveShift.mockResolvedValue({ data: { kind: 'off' } })
    useSql([
      [/FROM team_leaders/, [{ one: 1 }]],
      [/FROM planner_days/, [{ revision: 1 }]],
      [/FROM planner_block_logs/, [LOG_ROW]],
      [/FROM planner_unplanned_entries/, []],
    ])
    expect((await fetchLeadOpsPlannerAction('tl-1', DATE)).data?.rosterMismatch).toBe(true)
  })

  it('flags a mismatch when only an unplanned entry is saved but it displaced a block of another shift', async () => {
    asTeamLeader('tl-1')
    mockResolveShift.mockResolvedValue({ data: { kind: 'late', startTime: '11:00:00', endTime: '20:00:00' } })
    useSql([
      [/FROM team_leaders/, [{ one: 1 }]],
      [/FROM planner_days/, [{ revision: 1 }]],
      [/FROM planner_block_logs/, []],
      [/FROM planner_unplanned_entries/, [{ ...UNPLANNED_ROW, displaced_block_id: 'tpl-early-b3' }]],
    ])
    const result = await fetchLeadOpsPlannerAction('tl-1', DATE)
    expect(result.data?.rosterMismatch).toBe(true)
    expect(result.data?.unplanned[0].displaced_block_id).toBe('tpl-early-b3') // returned untouched
  })

  it('a saved displaced block that still belongs to the shift is not a mismatch', async () => {
    asTeamLeader('tl-1')
    useSql([
      [/FROM team_leaders/, [{ one: 1 }]],
      [/FROM planner_days/, [{ revision: 1 }]],
      [/FROM planner_unplanned_entries/, [{ ...UNPLANNED_ROW, displaced_block_id: 'tpl-early-b3' }]],
    ])
    expect((await fetchLeadOpsPlannerAction('tl-1', DATE)).data?.rosterMismatch).toBe(false)
    expect(mockResolveShift).toHaveBeenCalled()
  })

  it('does not ask the roster anything when nothing is saved', async () => {
    asTeamLeader('tl-1')
    useSql([[/FROM team_leaders/, [{ one: 1 }]]])
    await fetchLeadOpsPlannerAction('tl-1', DATE)
    expect(mockResolveShift).not.toHaveBeenCalled()
  })

  it('reports a failed load without throwing', async () => {
    asTeamLeader('tl-1')
    mockSql.mockRejectedValue(new Error('relation "planner_days" does not exist'))
    expect(await fetchLeadOpsPlannerAction('tl-1', DATE)).toEqual({ error: 'Could not load planner data.' })
    expect(console.error).toHaveBeenCalledWith('fetchLeadOpsPlannerAction failed', expect.any(Error))
  })

  it('reports a failed load when the roster cannot be resolved', async () => {
    asTeamLeader('tl-1')
    mockResolveShift.mockResolvedValue({ error: 'x' })
    useSql([
      [/FROM team_leaders/, [{ one: 1 }]],
      [/FROM planner_days/, [{ revision: 1 }]],
      [/FROM planner_block_logs/, [LOG_ROW]],
      [/FROM planner_unplanned_entries/, []],
    ])
    expect(await fetchLeadOpsPlannerAction('tl-1', DATE)).toEqual({ error: 'Could not load planner data.' })
  })
})

// ─── Saves ────────────────────────────────────────────────────────────────

const completedBlock = { template_block_id: 'tpl-early-b1', status: 'completed' as const, actual_minutes: 30, actual_category: 'team_management' as const, actual_activity: null, reason: null }
const movedBlock = { template_block_id: 'tpl-early-b2', status: 'moved' as const, actual_minutes: 45, actual_category: 'operations' as const, actual_activity: '  Covered  ', reason: '  Spike  ' }
const missedBlock = { template_block_id: 'tpl-early-b3', status: 'not_completed' as const, actual_minutes: null, actual_category: null, actual_activity: null, reason: 'Meeting' }
const unplannedEntry = { category: 'escalations' as const, minutes: 20, reason: 'Escalation', displaced_block_id: null }

const request = (over: Partial<Parameters<typeof savePlannerDayAction>[0]> = {}) => ({
  tlId: 'tl-1', date: DATE, expectedRevision: 0, blocks: [completedBlock, movedBlock, missedBlock], unplanned: [unplannedEntry], ...over,
})

const txCalls = (re: RegExp) =>
  mockTx.mock.calls
    .map(([strings, ...values]) => ({ text: (strings as string[]).join('?'), values: values as unknown[] }))
    .filter((c) => re.test(c.text))

/** The transaction's statements, routed by text. By default the revision statement succeeds. */
function useTx(routes: Route[] = []) {
  const all: Route[] = [
    ...routes,
    [/INSERT INTO planner_days/, [{ revision: 1 }]],
    [/UPDATE planner_days/, [{ revision: 5 }]],
  ]
  mockTx.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?')
    for (const [re, result] of all) {
      if (re.test(text)) return typeof result === 'function' ? (result as (v: unknown[]) => unknown)(values) : result
    }
    return []
  })
}

describe('savePlannerDayAction — identity', () => {
  beforeEach(() => { useSql([]); useTx() })

  it('saves a team leader\'s own day', async () => {
    asTeamLeader('tl-1')
    expect(await savePlannerDayAction(request())).toEqual({ data: { revision: 1 } })
  })
  it.each([
    ['management', asManagement],
    ['an HOD', asHod],
    ['a plain admin', asPlainAdmin],
    ['an agent', asAgent],
  ])('refuses %s, even naming a real team leader', async (_n, as) => {
    as()
    expect(await savePlannerDayAction(request())).toEqual({ error: 'Forbidden' })
    expect(mockSql).not.toHaveBeenCalled()
    expect(mockTx).not.toHaveBeenCalled()
  })
  it('refuses a team leader saving another team leader\'s day (a forged tl_id)', async () => {
    asTeamLeader('tl-1')
    expect(await savePlannerDayAction(request({ tlId: 'tl-2' }))).toEqual({ error: 'Forbidden' })
    expect(mockTx).not.toHaveBeenCalled()
  })
  it('refuses the explicit team_leader role without a team_leaders row (the mapping is required)', async () => {
    signedInAs('tl-1', 'team_leader', false)
    expect(await savePlannerDayAction(request())).toEqual({ error: 'Forbidden' })
  })
})

describe('savePlannerDayAction — the editing window', () => {
  beforeEach(() => { asTeamLeader('tl-1'); useSql([]); useTx() })

  it('allows yesterday before 12:00 SA and refuses it from 12:00', async () => {
    jest.setSystemTime(new Date('2026-10-08T09:59:00Z')) // 11:59 SA
    expect('data' in (await savePlannerDayAction(request({ date: '2026-10-07' })))).toBe(true)
    jest.setSystemTime(new Date('2026-10-08T10:00:00Z')) // 12:00 SA
    expect(await savePlannerDayAction(request({ date: '2026-10-07' }))).toEqual({ error: M.windowClosed })
  })
  it('refuses a future day and an older day without touching the database', async () => {
    expect(await savePlannerDayAction(request({ date: '2026-10-09' }))).toEqual({ error: M.notStarted })
    expect(await savePlannerDayAction(request({ date: '2026-10-06' }))).toEqual({ error: M.windowClosed })
    expect(await savePlannerDayAction(request({ date: 'nope' }))).toEqual({ error: 'Invalid date.' })
    expect(mockTx).not.toHaveBeenCalled()
  })
  it('refuses an invalid revision', async () => {
    expect(await savePlannerDayAction(request({ expectedRevision: -1 }))).toEqual({ error: M.invalidRevision })
    expect(await savePlannerDayAction(request({ expectedRevision: 1.5 }))).toEqual({ error: M.invalidRevision })
  })
})

describe('savePlannerDayAction — roster', () => {
  beforeEach(() => { asTeamLeader('tl-1'); useTx() })

  it('refuses a block that is not part of the resolved shift', async () => {
    useSql([])
    mockResolveShift.mockResolvedValue({ data: { kind: 'late', startTime: '11:00:00', endTime: '20:00:00' } })
    expect(await savePlannerDayAction(request())).toEqual({ error: M.invalidBlock })
  })
  it.each([['off', { kind: 'off' }], ['unknown', { kind: 'unknown' }]])('with the roster %s, refuses blocks but accepts unplanned work only', async (_n, shift) => {
    useSql([])
    mockResolveShift.mockResolvedValue({ data: shift })
    expect(await savePlannerDayAction(request())).toEqual({ error: M.noShift })
    expect(await savePlannerDayAction(request({ blocks: [] }))).toEqual({ data: { revision: 1 } })
  })
  it('refuses to edit a day whose SAVED blocks no longer match the roster, and writes nothing', async () => {
    useSql([[/FROM planner_block_logs/, [{ template_block_id: 'tpl-late-b1' }]]])
    expect(await savePlannerDayAction(request())).toEqual({ error: M.rosterChanged })
    expect(mockTx).not.toHaveBeenCalled()
  })
  it('refuses to edit a day whose SAVED unplanned entry displaced a block of another shift, and writes nothing', async () => {
    useSql([[/FROM planner_unplanned_entries/, [{ displaced_block_id: 'tpl-early-b3' }]]])
    mockResolveShift.mockResolvedValue({ data: { kind: 'late', startTime: '11:00:00', endTime: '20:00:00' } })
    expect(await savePlannerDayAction(request({ blocks: [], unplanned: [unplannedEntry] }))).toEqual({ error: M.rosterChanged })
    expect(mockTx).not.toHaveBeenCalled()
  })
  it('passes a roster lookup error through', async () => {
    useSql([])
    mockResolveShift.mockResolvedValue({ error: 'Could not resolve this team leader’s shift.' })
    expect(await savePlannerDayAction(request())).toEqual({ error: 'Could not resolve this team leader’s shift.' })
  })
})

describe('savePlannerDayAction — field rules', () => {
  beforeEach(() => { asTeamLeader('tl-1'); useSql([]); useTx() })

  it.each([
    ['a completed block with 0 minutes', { blocks: [{ ...completedBlock, actual_minutes: 0 }] }, M.invalidMinutes],
    ['a completed block with no category', { blocks: [{ ...completedBlock, actual_category: null }] }, M.invalidCategory],
    ['a moved block with no reason', { blocks: [{ ...movedBlock, reason: ' ' }] }, M.reasonRequired],
    ['a not-completed block with minutes', { blocks: [{ ...missedBlock, actual_minutes: 10 }] }, M.notCompletedFields],
    ['a duplicate block', { blocks: [completedBlock, completedBlock] }, M.duplicateBlock],
    ['an unplanned entry with 0 minutes', { unplanned: [{ ...unplannedEntry, minutes: 0 }] }, M.invalidMinutes],
    ['an unplanned entry with no reason', { unplanned: [{ ...unplannedEntry, reason: '' }] }, M.reasonRequired],
    ['an unplanned entry displacing a block of another shift', { unplanned: [{ ...unplannedEntry, displaced_block_id: 'tpl-late-b1' }] }, M.invalidBlock],
  ])('refuses %s and writes nothing', async (_name, over, message) => {
    expect(await savePlannerDayAction(request(over))).toEqual({ error: message })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('refuses 51 unplanned entries and writes nothing (50 is the cap)', async () => {
    const many = (n: number) => Array.from({ length: n }, () => unplannedEntry)
    expect(await savePlannerDayAction(request({ unplanned: many(51) }))).toEqual({ error: M.tooManyUnplanned })
    expect(mockTx).not.toHaveBeenCalled()
    expect(await savePlannerDayAction(request({ unplanned: many(50) }))).toEqual({ data: { revision: 1 } })
  })
})

describe('savePlannerDayAction — malformed requests (posted directly, not from the form)', () => {
  beforeEach(() => { asTeamLeader('tl-1'); useSql([]); useTx() })

  it.each([[null], [undefined], ['x'], [42]])('refuses a request that is not an object (%p) without touching the database', async (bad) => {
    expect(await savePlannerDayAction(bad as never)).toEqual({ error: 'Forbidden' })
    expect(mockSql).not.toHaveBeenCalled()
    expect(mockTx).not.toHaveBeenCalled()
  })
  it('refuses missing blocks or unplanned lists as Invalid block, and writes nothing', async () => {
    expect(await savePlannerDayAction(request({ blocks: undefined as never }))).toEqual({ error: M.invalidBlock })
    expect(await savePlannerDayAction(request({ unplanned: undefined as never }))).toEqual({ error: M.invalidBlock })
    expect(mockTx).not.toHaveBeenCalled()
  })
  it('a block with its optional keys left out saves with explicit nulls (no false outage logged)', async () => {
    const forged = { template_block_id: 'tpl-early-b1', status: 'completed', actual_minutes: 30, actual_category: 'qa' }
    expect(await savePlannerDayAction(request({ blocks: [forged as never], unplanned: [{ category: 'qa', minutes: 5, reason: 'x' } as never] }))).toEqual({ data: { revision: 1 } })
    expect(console.error).not.toHaveBeenCalled()
    const insert = txCalls(/INSERT INTO planner_block_logs/)[0]
    expect(insert.values).toEqual(['tl-1', DATE, 'tpl-early-b1', 'completed', 30, 'qa', null, null])
    expect(txCalls(/INSERT INTO planner_unplanned_entries/)[0].values).toEqual(['tl-1', DATE, 'qa', 5, 'x', null])
  })
})

describe('savePlannerDayAction — the write', () => {
  beforeEach(() => { asTeamLeader('tl-1'); useSql([]) })

  it('first save (revision 0): inserts the day row, replaces the rows, and returns revision 1', async () => {
    useTx()
    expect(await savePlannerDayAction(request())).toEqual({ data: { revision: 1 } })
    expect(txCalls(/INSERT INTO planner_days/)).toHaveLength(1)
    expect(txCalls(/INSERT INTO planner_days/)[0].text).toMatch(/ON CONFLICT \(tl_id, date\) DO NOTHING/)
    expect(txCalls(/DELETE FROM planner_block_logs/)).toHaveLength(1)
    expect(txCalls(/DELETE FROM planner_unplanned_entries/)).toHaveLength(1)
    expect(txCalls(/INSERT INTO planner_block_logs/)).toHaveLength(3)
    expect(txCalls(/INSERT INTO planner_unplanned_entries/)).toHaveLength(1)
  })

  it('stores trimmed text and the tl_id from the session, not from the client', async () => {
    useTx()
    await savePlannerDayAction(request())
    const moved = txCalls(/INSERT INTO planner_block_logs/).find((c) => c.values.includes('tpl-early-b2'))!
    expect(moved.values).toEqual(expect.arrayContaining(['tl-1', DATE, 'moved', 45, 'operations', 'Covered', 'Spike']))
  })

  it('later save: checks and bumps the revision in one UPDATE and returns the new revision', async () => {
    useTx()
    expect(await savePlannerDayAction(request({ expectedRevision: 4 }))).toEqual({ data: { revision: 5 } })
    const update = txCalls(/UPDATE planner_days/)[0]
    expect(update.text).toMatch(/revision = revision \+ 1/)
    expect(update.text).toMatch(/AND revision = \?/)
    expect(update.values).toEqual(expect.arrayContaining(['tl-1', DATE, 4]))
  })

  it('a stale revision is a conflict and writes nothing', async () => {
    useTx([[/UPDATE planner_days/, []]])
    expect(await savePlannerDayAction(request({ expectedRevision: 2 }))).toEqual({ error: M.conflict })
    expect(txCalls(/DELETE FROM|INSERT INTO planner_(block|unplanned)/)).toHaveLength(0)
  })

  it('two simultaneous first saves: the one that loses the INSERT gets the conflict and writes nothing', async () => {
    useTx([[/INSERT INTO planner_days/, []]]) // ON CONFLICT DO NOTHING returned no row: another save created the day first
    expect(await savePlannerDayAction(request({ expectedRevision: 0 }))).toEqual({ error: M.conflict })
    expect(txCalls(/DELETE FROM|INSERT INTO planner_(block|unplanned)/)).toHaveLength(0)
  })

  it('saving an empty day still bumps the revision and replaces (clears) the rows', async () => {
    useTx()
    expect(await savePlannerDayAction(request({ expectedRevision: 4, blocks: [], unplanned: [] }))).toEqual({ data: { revision: 5 } })
    expect(txCalls(/DELETE FROM planner_block_logs/)).toHaveLength(1)
    expect(txCalls(/INSERT INTO planner_block_logs/)).toHaveLength(0)
  })

  it('a failing write inside the transaction is reported generically (the real transaction rolls back, revision bump included)', async () => {
    useTx([[/INSERT INTO planner_block_logs/, () => { throw new Error('check constraint violated') }]])
    expect(await savePlannerDayAction(request())).toEqual({ error: M.saveFailed })
    expect(console.error).toHaveBeenCalledWith('savePlannerDayAction failed', expect.any(Error))
  })

  it('a missing table is reported generically, not as a crash', async () => {
    mockTx.mockRejectedValue(new Error('relation "planner_days" does not exist'))
    expect(await savePlannerDayAction(request())).toEqual({ error: M.saveFailed })
  })
})
