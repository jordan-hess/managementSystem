import { sql } from '@/lib/db/pool'
import { requireActiveUser } from '@/lib/auth/requireUser'
import { isSubmitterTeamLeader } from '@/lib/auth/authz'
import { loadReviewFigures } from './reviewFigures'
import { acknowledgeReviewAction, fetchLeadOpsReviewAction, fetchReviewRosterAction, markReviewViewedAction, reopenReviewAction, saveReviewDraftAction, shareReviewAction, type ReviewerReviewView, type TeamLeaderReviewView } from './reviewActions'
import { REVIEW_MESSAGES as M } from './reviewLimits'
import { buildReviewSnapshot } from './reviewSnapshot'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireActiveUser: jest.fn() }))
jest.mock('@/lib/auth/authz', () => ({ isSubmitterTeamLeader: jest.fn() }))
jest.mock('./reviewFigures', () => ({ loadReviewFigures: jest.fn() }))
jest.mock('@/lib/db/tx', () => ({ withTransaction: (fn: (tx: unknown) => unknown) => fn(mockTx) }))

const mockSql = sql as unknown as jest.Mock
const mockTx = jest.fn()
const mockRequireActiveUser = requireActiveUser as jest.Mock
const mockIsTeamLeader = isSubmitterTeamLeader as jest.Mock
const mockFigures = loadReviewFigures as jest.Mock

const PERIOD = '2026-10-01'
const EMPTY_WEEKLY = { weeks: 0, calibrationAttended: 0, coachingSessions: 0, agentInSeatDays: 0, criticalFails: 0, reAudits: 0 }

type Route = [RegExp, unknown | ((values: unknown[]) => unknown)]
/** Routes by SQL text (first match wins; unmatched queries return []). */
function route(target: jest.Mock, routes: Route[]) {
  target.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?')
    for (const [re, result] of routes) {
      if (re.test(text)) {
        if (typeof result === 'function') return (result as (v: unknown[]) => unknown)(values)
        return result
      }
    }
    return []
  })
}
const useSql = (routes: Route[]) => route(mockSql, routes)
const useTx = (routes: Route[] = []) => route(mockTx, routes)

function signedInAs(userId: string, role: string, hasTeamRow = false) {
  mockRequireActiveUser.mockResolvedValue({ userId, role, t2Team: null, fullName: userId, forcePasswordChange: false })
  mockIsTeamLeader.mockResolvedValue(hasTeamRow)
}
const asTeamLeader = (id = 'tl-1') => signedInAs(id, 'admin', true)
const asManagement = () => signedInAs('mgmt-1', 'management')
const asHod = () => signedInAs('hod-1', 'hod')
const asPlainAdmin = () => signedInAs('admin-1', 'admin')
const asAgent = () => signedInAs('agent-1', 'agent')

const TL_ROW = [{ id: 'tl-1', full_name: 'Taylor' }]
const SHARE_SNAPSHOT = buildReviewSnapshot({ period: PERIOD, teamLeaderName: 'Taylor', sharedByName: 'Alex', takenAt: '2026-11-03T12:20:00.000Z', scores: [], weekly: EMPTY_WEEKLY })

const reviewRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1', tl_id: 'tl-1', tl_name: 'Taylor', period: PERIOD, status: 'draft', notes: 'DRAFT NOTES', agreed_actions: 'DRAFT ACTIONS', revision: 3,
  created_by: 'mgmt-1', created_by_name: 'Alex', last_edited_by: 'mgmt-1', last_edited_by_name: 'Alex', shared_by: null, shared_by_name: null,
  current_share_event_id: null, tl_viewed_event_id: null, updated_at: 't', ...over,
})
const eventRow = (over: Record<string, unknown> = {}) => ({
  id: 'e1', review_id: 'r1', from_status: null, to_status: 'draft', actor_id: 'mgmt-1', actor_name: 'Alex', reason: null, note: null,
  notes_copy: null, actions_copy: null, snapshot: null, snapshot_version: null, created_at: '2026-11-01T08:00:00Z', ...over,
})
const shareEvent = (over: Record<string, unknown> = {}) =>
  eventRow({ id: 'e2', from_status: 'draft', to_status: 'shared', notes_copy: 'SHARED NOTES', actions_copy: 'SHARED ACTIONS', snapshot: SHARE_SNAPSHOT, snapshot_version: 1, created_at: '2026-11-03T12:20:00Z', ...over })

beforeEach(() => {
  mockSql.mockReset()
  mockTx.mockReset()
  // postgres.js's tx.json(value): tagged so a test can tell "the object was handed over as JSON" from "a string was passed".
  ;(mockTx as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => ({ __json: v })
  mockRequireActiveUser.mockReset()
  mockIsTeamLeader.mockReset()
  mockFigures.mockReset()
  mockFigures.mockResolvedValue({ scores: [], weekly: EMPTY_WEEKLY })
  jest.useFakeTimers({ now: new Date('2026-11-05T10:00:00Z') })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('fetchLeadOpsReviewAction — who may read', () => {
  const real: Route[] = [[/FROM team_leaders/, TL_ROW]]

  it('refuses a team leader reading another team leader, a plain admin and an agent — before any database access', async () => {
    useSql(real)
    asTeamLeader('tl-1')
    expect(await fetchLeadOpsReviewAction('tl-2', PERIOD)).toEqual({ error: 'Forbidden' })
    asPlainAdmin()
    expect(await fetchLeadOpsReviewAction('tl-1', PERIOD)).toEqual({ error: 'Forbidden' })
    asAgent()
    expect(await fetchLeadOpsReviewAction('tl-1', PERIOD)).toEqual({ error: 'Forbidden' })
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('refuses a bad month before touching the database', async () => {
    asManagement()
    useSql(real)
    expect(await fetchLeadOpsReviewAction('tl-1', '2026-10-15')).toEqual({ error: M.invalidMonth })
    expect(await fetchLeadOpsReviewAction('tl-1', '2027-01-01')).toEqual({ error: M.outsideWindow })
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('refuses a target that is not a real team leader, and non-string ids', async () => {
    asManagement()
    useSql([[/FROM team_leaders/, []]])
    expect(await fetchLeadOpsReviewAction('someone', PERIOD)).toEqual({ error: M.invalidTeamLeader })
    expect(await fetchLeadOpsReviewAction('', PERIOD)).toEqual({ error: M.invalidTeamLeader })
  })

  it('maps a Postgres invalid-uuid error to Invalid team leader without logging an outage', async () => {
    asManagement()
    mockSql.mockRejectedValue(Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' }))
    expect(await fetchLeadOpsReviewAction('not-a-uuid', PERIOD)).toEqual({ error: M.invalidTeamLeader })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('reports a failed load generically and logs it', async () => {
    asManagement()
    mockSql.mockRejectedValue(new Error('relation "performance_reviews" does not exist'))
    expect(await fetchLeadOpsReviewAction('tl-1', PERIOD)).toEqual({ error: M.loadFailed })
    expect(console.error).toHaveBeenCalledWith('fetchLeadOpsReviewAction failed', expect.any(Error))
  })
})

describe('fetchLeadOpsReviewAction — the team leader sees only the frozen share', () => {
  beforeEach(asTeamLeader)

  /** The exact shape a team leader receives: nothing extra can ride along, and no draft text (notes or agreed actions) appears anywhere. */
  function expectNoLeak(result: unknown, ...extraSecrets: string[]) {
    const view = (result as { data: TeamLeaderReviewView }).data
    expect(Object.keys(view).sort()).toEqual(['events', 'kind', 'reviewId', 'shared', 'state'])
    for (const e of view.events) expect(Object.keys(e).sort()).toEqual(['actorName', 'at', 'fromStatus', 'id', 'note', 'toStatus'])
    const text = JSON.stringify(result)
    for (const secret of ['DRAFT NOTES', 'DRAFT ACTIONS', ...extraSecrets]) expect(text).not.toContain(secret)
  }

  it('with no review at all: state none, nothing else', async () => {
    useSql([[/FROM team_leaders/, TL_ROW]])
    const result = await fetchLeadOpsReviewAction('tl-1', PERIOD)
    expect(result.data).toEqual({ kind: 'team_leader', state: 'none', reviewId: null, shared: null, events: [] })
  })

  it('a draft that was never shared is indistinguishable from no review (no draft text, no hint it exists)', async () => {
    useSql([
      [/FROM team_leaders/, TL_ROW],
      [/FROM performance_reviews/, [reviewRow()]],
      [/FROM review_events/, [eventRow()]],
    ])
    const result = await fetchLeadOpsReviewAction('tl-1', PERIOD)
    expect(result.data).toEqual({ kind: 'team_leader', state: 'none', reviewId: null, shared: null, events: [] })
    expectNoLeak(result)
  })

  it('an unshared review that was shared before is "being revised" — still no text', async () => {
    useSql([
      [/FROM team_leaders/, TL_ROW],
      [/FROM performance_reviews/, [reviewRow({ status: 'draft', current_share_event_id: 'e2', shared_by: 'mgmt-1', shared_by_name: 'Alex', notes: 'REVISED SECRET' })]],
      [/FROM review_events/, [eventRow(), shareEvent(), eventRow({ id: 'e3', from_status: 'shared', to_status: 'draft', created_at: '2026-11-04T09:00:00Z' })]],
    ])
    const result = await fetchLeadOpsReviewAction('tl-1', PERIOD)
    const view = result.data as TeamLeaderReviewView
    expect(view.state).toBe('being_revised')
    expect(view.shared).toBeNull()
    expectNoLeak(result, 'REVISED SECRET', 'SHARED NOTES', 'SHARED ACTIONS')
  })

  it('a shared review shows the frozen copies, the reviewer name and time — and the events carry no copies and no draft creation', async () => {
    useSql([
      [/FROM team_leaders/, TL_ROW],
      [/FROM performance_reviews/, [reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by: 'mgmt-1', shared_by_name: 'Alex', notes: 'LIVE EDIT NOT YET SHARED' })]],
      [/FROM review_events/, [eventRow(), shareEvent()]],
    ])
    const result = await fetchLeadOpsReviewAction('tl-1', PERIOD)
    const view = result.data as TeamLeaderReviewView
    expect(view.state).toBe('shared')
    expect(view.reviewId).toBe('r1')
    expect(view.shared).toEqual({
      shareEventId: 'e2', notes: 'SHARED NOTES', agreedActions: 'SHARED ACTIONS', snapshot: SHARE_SNAPSHOT, reviewedBy: 'Alex', sharedAt: '2026-11-03T12:20:00Z',
    })
    expect(view.events.map((e) => e.id)).toEqual(['e2']) // the null -> draft creation is not shown
    expectNoLeak(result, 'LIVE EDIT NOT YET SHARED')
  })

  it('an acknowledged review carries the team leader\'s own comment on its event', async () => {
    useSql([
      [/FROM team_leaders/, TL_ROW],
      [/FROM performance_reviews/, [reviewRow({ status: 'acknowledged', current_share_event_id: 'e2', shared_by: 'mgmt-1', shared_by_name: 'Alex' })]],
      [/FROM review_events/, [eventRow(), shareEvent(), eventRow({ id: 'e3', from_status: 'shared', to_status: 'acknowledged', actor_id: 'tl-1', actor_name: 'Taylor', note: 'Thanks, noted', created_at: '2026-11-04T08:00:00Z' })]],
    ])
    const result = await fetchLeadOpsReviewAction('tl-1', PERIOD)
    const view = result.data as TeamLeaderReviewView
    expectNoLeak(result)
    expect(view.state).toBe('acknowledged')
    expect(view.events.find((e) => e.id === 'e3')).toMatchObject({ toStatus: 'acknowledged', actorName: 'Taylor', note: 'Thanks, noted' })
  })

  it('never computes live figures for a team leader', async () => {
    useSql([[/FROM team_leaders/, TL_ROW]])
    await fetchLeadOpsReviewAction('tl-1', PERIOD)
    expect(mockFigures).not.toHaveBeenCalled()
  })
})

describe('fetchLeadOpsReviewAction — management and HOD see the whole review', () => {
  const full: Route[] = [
    [/FROM team_leaders/, TL_ROW],
    [/FROM performance_reviews/, [reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by: 'mgmt-1', shared_by_name: 'Alex', tl_viewed_event_id: 'e2' })]],
    [/FROM review_events/, [eventRow(), shareEvent()]],
  ]

  it.each([['management', asManagement], ['an HOD', asHod]])('%s get the draft text, the live figures, and the events with their copies', async (_n, as) => {
    as()
    useSql(full)
    const view = (await fetchLeadOpsReviewAction('tl-1', PERIOD)).data as ReviewerReviewView
    expect(view.kind).toBe('reviewer')
    expect(view.review).toMatchObject({ id: 'r1', status: 'shared', notes: 'DRAFT NOTES', agreedActions: 'DRAFT ACTIONS', revision: 3, sharedByName: 'Alex' })
    expect(view.live.period).toBe(PERIOD)
    expect(view.live.teamLeaderName).toBe('Taylor')
    expect(view.events.find((e) => e.id === 'e2')).toMatchObject({ notesCopy: 'SHARED NOTES', actionsCopy: 'SHARED ACTIONS', snapshotVersion: 1 })
    expect(view.seenByTeamLeader).toBe(true)
    expect(mockFigures).toHaveBeenCalledWith('tl-1', PERIOD)
  })

  it('flags figures that changed since the share, without any change to the review', async () => {
    asManagement()
    useSql(full)
    mockFigures.mockResolvedValue({ scores: [], weekly: { ...EMPTY_WEEKLY, coachingSessions: 4 } })
    const view = (await fetchLeadOpsReviewAction('tl-1', PERIOD)).data as ReviewerReviewView
    expect(view.changes).toEqual([{ label: 'Coaching sessions', before: '0', after: '4' }])
  })

  it('has no changes to show for a draft, and seenByTeamLeader is false when the viewed share is not the current one', async () => {
    asManagement()
    useSql([
      [/FROM team_leaders/, TL_ROW],
      [/FROM performance_reviews/, [reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by_name: 'Alex', tl_viewed_event_id: 'e0' })]],
      [/FROM review_events/, [eventRow(), shareEvent()]],
    ])
    const view = (await fetchLeadOpsReviewAction('tl-1', PERIOD)).data as ReviewerReviewView
    expect(view.seenByTeamLeader).toBe(false)
  })

  it('shows the previous acknowledgement comment while the reviewer revises a reopened review', async () => {
    asHod()
    useSql([
      [/FROM team_leaders/, TL_ROW],
      [/FROM performance_reviews/, [reviewRow({ status: 'draft', current_share_event_id: 'e2', shared_by_name: 'Alex' })]],
      [/FROM review_events/, [
        eventRow(), shareEvent(),
        eventRow({ id: 'e3', from_status: 'shared', to_status: 'acknowledged', actor_id: 'tl-1', actor_name: 'Taylor', note: 'The 10:30 slot is never free', created_at: '2026-11-04T08:00:00Z' }),
        eventRow({ id: 'e4', from_status: 'acknowledged', to_status: 'draft', actor_id: 'hod-1', actor_name: 'Sam', reason: 'Add the VIP target', created_at: '2026-11-05T08:00:00Z' }),
      ]],
    ])
    const view = (await fetchLeadOpsReviewAction('tl-1', PERIOD)).data as ReviewerReviewView
    expect(view.previousComment).toEqual({ note: 'The 10:30 slot is never free', actorName: 'Taylor', at: '2026-11-04T08:00:00Z' })
    expect(view.changes).toEqual([])
  })

  it('a former team leader (no team_leaders row) whose review exists that month can still be opened, under the stored name', async () => {
    asManagement()
    useSql([
      [/FROM team_leaders/, []],
      [/FROM performance_reviews/, [reviewRow({ status: 'acknowledged', tl_name: 'Taylor (stored)', current_share_event_id: 'e2', shared_by_name: 'Alex' })]],
      [/FROM review_events/, [eventRow(), shareEvent()]],
    ])
    const result = await fetchLeadOpsReviewAction('tl-1', PERIOD)
    expect(result.error).toBeUndefined()
    const view = result.data as ReviewerReviewView
    expect(view.review).toMatchObject({ id: 'r1', tlName: 'Taylor (stored)' })
    expect(view.live.teamLeaderName).toBe('Taylor (stored)')
    expect(mockFigures).toHaveBeenCalledWith('tl-1', PERIOD)
  })

  it('an id with neither a team_leaders row nor a review that month is still Invalid team leader', async () => {
    asHod()
    useSql([[/FROM team_leaders/, []]])
    expect(await fetchLeadOpsReviewAction('tl-1', PERIOD)).toEqual({ error: M.invalidTeamLeader })
    expect(mockFigures).not.toHaveBeenCalled()
  })

  it('a team leader with no review yet: review is null and the live figures are still returned', async () => {
    asManagement()
    useSql([[/FROM team_leaders/, TL_ROW]])
    const view = (await fetchLeadOpsReviewAction('tl-1', PERIOD)).data as ReviewerReviewView
    expect(view.review).toBeNull()
    expect(view.events).toEqual([])
    expect(view.live.teamLeaderName).toBe('Taylor')
  })
})

// ─── Saving the draft ─────────────────────────────────────────────────────

const txCalls = (re: RegExp) =>
  mockTx.mock.calls
    .map(([strings, ...values]) => ({ text: (strings as string[]).join('?'), values: values as unknown[] }))
    .filter((c) => re.test(c.text))

const baseRoutes: Route[] = [
  [/FROM team_leaders/, TL_ROW],
  [/SELECT full_name FROM profiles/, [{ full_name: 'Alex' }]],
]

const draftReq = (over: Partial<Parameters<typeof saveReviewDraftAction>[0]> = {}) => ({
  tlId: 'tl-1', period: PERIOD, expectedRevision: 0, notes: 'Strong month', agreedActions: '1. Protect 10:30', confirmUnshare: false, ...over,
})

describe('saveReviewDraftAction — who and what', () => {
  beforeEach(() => { asManagement(); useSql(baseRoutes); useTx([[/INSERT INTO performance_reviews/, [{ id: 'r1', revision: 1 }]], [/UPDATE performance_reviews/, [{ revision: 4 }]]]) })

  it.each([['a team leader', () => asTeamLeader('tl-1')], ['a plain admin', asPlainAdmin], ['an agent', asAgent]])('refuses %s without touching the database', async (_n, as) => {
    as()
    expect(await saveReviewDraftAction(draftReq())).toEqual({ error: 'Forbidden' })
    expect(mockSql).not.toHaveBeenCalled()
    expect(mockTx).not.toHaveBeenCalled()
  })

  it.each([
    ['a mid-month period', { period: '2026-10-15' }, M.invalidMonth],
    ['a future month', { period: '2026-12-01' }, M.outsideWindow],
    ['a non-string team leader', { tlId: 5 as unknown as string }, M.invalidTeamLeader],
    ['a negative revision', { expectedRevision: -1 }, M.invalidRevision],
    ['a fractional revision', { expectedRevision: 1.5 }, M.invalidRevision],
    ['over-long notes', { notes: 'x'.repeat(8001) }, M.notesTooLong],
    ['over-long agreed actions', { agreedActions: 'x'.repeat(4001) }, M.actionsTooLong],
  ])('refuses %s and writes nothing', async (_n, over, message) => {
    expect(await saveReviewDraftAction(draftReq(over))).toEqual({ error: message })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('refuses a malformed request without throwing', async () => {
    expect(await saveReviewDraftAction(null as never)).toEqual({ error: M.invalidMonth })
    expect(await saveReviewDraftAction(undefined as never)).toEqual({ error: M.invalidMonth })
  })

  it('refuses a target that is not a real team leader', async () => {
    useSql([[/FROM team_leaders/, []]])
    expect(await saveReviewDraftAction(draftReq())).toEqual({ error: M.invalidTeamLeader })
  })

  it('refuses a former team leader even though a review of theirs exists', async () => {
    useSql([[/FROM team_leaders/, []], [/FROM performance_reviews/, [reviewRow()]]])
    expect(await saveReviewDraftAction(draftReq({ expectedRevision: 3 }))).toEqual({ error: M.invalidTeamLeader })
    expect(mockTx).not.toHaveBeenCalled()
  })
})

describe('saveReviewDraftAction — creating and editing', () => {
  beforeEach(() => { asManagement(); useTx([[/INSERT INTO performance_reviews/, [{ id: 'r1', revision: 1 }]], [/UPDATE performance_reviews/, [{ revision: 4 }]]]) })

  it('first save (revision 0): inserts the review with the names, writes the creation event, returns revision 1', async () => {
    useSql([...baseRoutes, [/FROM performance_reviews/, []]])
    expect(await saveReviewDraftAction(draftReq())).toEqual({ data: { revision: 1, unshared: false } })
    const insert = txCalls(/INSERT INTO performance_reviews/)[0]
    expect(insert.text).toMatch(/ON CONFLICT \(tl_id, period\) DO NOTHING/)
    expect(insert.values).toEqual(expect.arrayContaining(['tl-1', 'Taylor', PERIOD, 'Strong month', '1. Protect 10:30', 'mgmt-1', 'Alex']))
    const event = txCalls(/INSERT INTO review_events/)[0]
    expect(event.values).toEqual(expect.arrayContaining(['r1', 'mgmt-1', 'Alex']))
    expect(event.text).toMatch(/NULL, 'draft'/)
  })

  it('two simultaneous first saves: the loser gets the conflict and writes nothing', async () => {
    useSql([...baseRoutes, [/FROM performance_reviews/, []]])
    useTx([[/INSERT INTO performance_reviews/, []]]) // ON CONFLICT DO NOTHING returned no row
    expect(await saveReviewDraftAction(draftReq())).toEqual({ error: M.conflict })
    expect(txCalls(/INSERT INTO review_events/)).toHaveLength(0)
  })

  it('a first save when the review already exists is a conflict', async () => {
    useSql([...baseRoutes, [/FROM performance_reviews/, [reviewRow()]]])
    expect(await saveReviewDraftAction(draftReq())).toEqual({ error: M.conflict })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('edits a draft: one UPDATE that checks and bumps the revision, records the editor, no event', async () => {
    useSql([...baseRoutes, [/FROM performance_reviews/, [reviewRow({ status: 'draft', revision: 3 })]]])
    expect(await saveReviewDraftAction(draftReq({ expectedRevision: 3 }))).toEqual({ data: { revision: 4, unshared: false } })
    const update = txCalls(/UPDATE performance_reviews/)[0]
    expect(update.text).toMatch(/revision = revision \+ 1/)
    expect(update.text).toMatch(/AND revision = \?/)
    expect(update.values).toEqual(expect.arrayContaining(['r1', 3, 'mgmt-1', 'Alex']))
    expect(txCalls(/INSERT INTO review_events/)).toHaveLength(0)
  })

  it('a stale revision is a conflict and writes nothing', async () => {
    useSql([...baseRoutes, [/FROM performance_reviews/, [reviewRow({ revision: 5 })]]])
    useTx([[/UPDATE performance_reviews/, []]])
    expect(await saveReviewDraftAction(draftReq({ expectedRevision: 3 }))).toEqual({ error: M.conflict })
    expect(txCalls(/INSERT INTO/)).toHaveLength(0)
  })

  it('editing a review that does not exist at that revision is a conflict', async () => {
    useSql([...baseRoutes, [/FROM performance_reviews/, []]])
    expect(await saveReviewDraftAction(draftReq({ expectedRevision: 3 }))).toEqual({ error: M.conflict })
  })

  it('an acknowledged review cannot be edited (the HOD reopens it)', async () => {
    useSql([...baseRoutes, [/FROM performance_reviews/, [reviewRow({ status: 'acknowledged', current_share_event_id: 'e2', shared_by_name: 'Alex' })]]])
    expect(await saveReviewDraftAction(draftReq({ expectedRevision: 3, confirmUnshare: true }))).toEqual({ error: M.acknowledgedLocked })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('editing a SHARED review needs the explicit confirmation — the server refuses without it', async () => {
    useSql([...baseRoutes, [/FROM performance_reviews/, [reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by_name: 'Alex' })]]])
    expect(await saveReviewDraftAction(draftReq({ expectedRevision: 3, confirmUnshare: false }))).toEqual({ error: M.confirmUnshare })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('with the confirmation, a shared review goes back to draft, logs shared -> draft, and tells the team leader only if they had opened it', async () => {
    const shared = reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by_name: 'Alex', tl_viewed_event_id: 'e2' })
    useSql([...baseRoutes, [/FROM performance_reviews/, [shared]]])
    useTx([[/UPDATE performance_reviews/, [{ revision: 4, tl_had_viewed: true }]]])
    expect(await saveReviewDraftAction(draftReq({ expectedRevision: 3, confirmUnshare: true }))).toEqual({ data: { revision: 4, unshared: true } })
    const update = txCalls(/UPDATE performance_reviews/)[0]
    expect(update.text).toMatch(/status = 'draft'/)
    expect(update.text).toMatch(/AND status = \?/)
    expect(txCalls(/INSERT INTO review_events/)[0].text).toMatch(/'shared', 'draft'/)
    const notice = txCalls(/INSERT INTO notifications/)
    expect(notice).toHaveLength(1)
    expect(notice[0].values).toEqual(expect.arrayContaining(['tl-1', 'mgmt-1', 'Performance review being revised', 'Your October review is being revised.']))
    expect(JSON.stringify(notice[0].values)).not.toContain('Strong month') // no review content in a notification
  })

  it('an unshare of a version the team leader never opened sends no notification', async () => {
    const shared = reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by_name: 'Alex', tl_viewed_event_id: null })
    useSql([...baseRoutes, [/FROM performance_reviews/, [shared]]])
    await saveReviewDraftAction(draftReq({ expectedRevision: 3, confirmUnshare: true }))
    expect(txCalls(/INSERT INTO notifications/)).toHaveLength(0)
  })

  const seedSql = useSql
  const seedTx = useTx
  const runUnshare = async (preViewed: string | null, tlHadViewed: boolean) => {
    seedSql([...baseRoutes, [/FROM performance_reviews/, [reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by_name: 'Alex', tl_viewed_event_id: preViewed })]]])
    seedTx([[/UPDATE performance_reviews/, [{ revision: 4, tl_had_viewed: tlHadViewed }]]])
    return saveReviewDraftAction(draftReq({ expectedRevision: 3, confirmUnshare: true }))
  }

  it('notifies from the row the UPDATE locked: the team leader opened it after the reviewer loaded the screen (pre-read says not viewed)', async () => {
    expect(await runUnshare(null, true)).toEqual({ data: { revision: 4, unshared: true } })
    const notice = txCalls(/INSERT INTO notifications/)
    expect(notice).toHaveLength(1)
    expect(notice[0].values).toEqual(expect.arrayContaining(['tl-1', 'mgmt-1']))
    expect(JSON.stringify(notice[0].values)).not.toContain('Strong month')
  })

  it('sends no notification when the locked row says the team leader had not viewed it, even if the pre-read said viewed', async () => {
    await runUnshare('e2', false)
    expect(txCalls(/INSERT INTO notifications/)).toHaveLength(0)
  })

  it('the UPDATE computes "viewed" as the CURRENT share event (an older viewed event does not count)', async () => {
    await runUnshare('e1', false)
    expect(txCalls(/INSERT INTO notifications/)).toHaveLength(0)
    const update = txCalls(/UPDATE performance_reviews/)[0]
    expect(update.text).toMatch(/tl_viewed_event_id IS NOT NULL AND tl_viewed_event_id = current_share_event_id\) AS tl_had_viewed/)
  })

  it('a failing write is reported generically and logged (the real transaction rolls back, notification included)', async () => {
    useSql([...baseRoutes, [/FROM performance_reviews/, [reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by_name: 'Alex', tl_viewed_event_id: 'e2' })]]])
    useTx([[/UPDATE performance_reviews/, [{ revision: 4, tl_had_viewed: true }]], [/INSERT INTO notifications/, () => { throw new Error('notifications down') }]])
    expect(await saveReviewDraftAction(draftReq({ expectedRevision: 3, confirmUnshare: true }))).toEqual({ error: M.saveFailed })
    expect(console.error).toHaveBeenCalledWith('saveReviewDraftAction failed', expect.any(Error))
  })
})

// ─── Sharing ──────────────────────────────────────────────────────────────

const shareReq = (over: Partial<Parameters<typeof shareReviewAction>[0]> = {}) => ({ tlId: 'tl-1', period: PERIOD, expectedRevision: 3, ...over })

describe('shareReviewAction', () => {
  const sharable = reviewRow({ status: 'draft', revision: 3, notes: 'Strong month', agreed_actions: '1. Protect 10:30' })
  beforeEach(() => {
    asHod()
    useSql([...baseRoutes, [/FROM performance_reviews/, [sharable]]])
    useTx([[/UPDATE performance_reviews/, [{ revision: 4, notes: 'Strong month', agreed_actions: '1. Protect 10:30' }]]])
  })

  it.each([['a team leader', () => asTeamLeader('tl-1')], ['a plain admin', asPlainAdmin], ['an agent', asAgent]])('refuses %s', async (_n, as) => {
    as()
    expect(await shareReviewAction(shareReq())).toEqual({ error: 'Forbidden' })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('refuses a former team leader even though a review of theirs exists', async () => {
    useSql([[/FROM team_leaders/, []], [/FROM performance_reviews/, [sharable]]])
    expect(await shareReviewAction(shareReq())).toEqual({ error: M.invalidTeamLeader })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('refuses a review that does not exist, and one that is already shared or acknowledged', async () => {
    useSql([...baseRoutes, [/FROM performance_reviews/, []]])
    expect(await shareReviewAction(shareReq())).toEqual({ error: M.notFound })
    useSql([...baseRoutes, [/FROM performance_reviews/, [reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by_name: 'Alex' })]]])
    expect(await shareReviewAction(shareReq())).toEqual({ error: M.illegalTransition })
    useSql([...baseRoutes, [/FROM performance_reviews/, [reviewRow({ status: 'acknowledged', current_share_event_id: 'e2', shared_by_name: 'Alex' })]]])
    expect(await shareReviewAction(shareReq())).toEqual({ error: M.illegalTransition })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('computes the snapshot ON THE SERVER from the real figures and stores it, with the copies, in the share event', async () => {
    mockFigures.mockResolvedValue({ scores: [], weekly: { ...EMPTY_WEEKLY, coachingSessions: 9 } })
    const result = await shareReviewAction(shareReq())
    expect(result.data).toMatchObject({ revision: 4 })
    expect(mockFigures).toHaveBeenCalledWith('tl-1', PERIOD)

    const event = txCalls(/INSERT INTO review_events/)[0]
    expect(event.text).toMatch(/'draft', 'shared'/)
    expect(event.values).toEqual(expect.arrayContaining([result.data!.shareEventId, 'r1', 'hod-1', 'Alex', 'Strong month', '1. Protect 10:30']))
    // The snapshot must reach postgres.js as an OBJECT through tx.json(): a pre-stringified string sent where the server
    // expects jsonb is JSON-encoded a second time, stored as a jsonb STRING, and read back as a string (the page then
    // fails with "Could not load this review." the moment a reviewer opens a shared review).
    expect(event.values.some((v) => typeof v === 'string' && v.trimStart().startsWith('{'))).toBe(false)
    const jsonParam = event.values.find((v) => typeof v === 'object' && v !== null && '__json' in v) as { __json: Record<string, unknown> } | undefined
    expect(jsonParam).toBeDefined()
    const stored = jsonParam!.__json as { weekly: { coachingSessions: number }; kpis: { key: string; notTracked: boolean }[]; takenAt: string }
    expect(stored).toMatchObject({ version: 1, period: PERIOD, teamLeaderName: 'Taylor', sharedByName: 'Alex' })
    expect(stored.weekly.coachingSessions).toBe(9)
    expect(stored.kpis.filter((k: { notTracked: boolean }) => k.notTracked).map((k: { key: string }) => k.key).sort()).toEqual(['planner_adherence', 'time_on_coaching_support'])
    expect(stored.takenAt).toBe('2026-11-05T10:00:00.000Z')
  })

  it('moves the review to shared in one revision-guarded UPDATE that points at the new share event', async () => {
    const result = await shareReviewAction(shareReq())
    const update = txCalls(/UPDATE performance_reviews/)[0]
    expect(update.text).toMatch(/status = 'shared'/)
    expect(update.text).toMatch(/current_share_event_id = \?/)
    expect(update.text).toMatch(/AND revision = \?/)
    expect(update.text).toMatch(/AND status = 'draft'/)
    expect(update.values).toEqual(expect.arrayContaining([result.data!.shareEventId, 'hod-1', 'Alex', 'r1', 3]))
  })

  it('notifies the team leader in the same transaction, naming the month and where to look, with no review content', async () => {
    await shareReviewAction(shareReq())
    const notice = txCalls(/INSERT INTO notifications/)
    expect(notice).toHaveLength(1)
    expect(notice[0].values).toEqual(expect.arrayContaining(['tl-1', 'hod-1', 'Performance review ready', 'Your October review is ready — open My Performance Review.']))
    expect(JSON.stringify(notice[0].values)).not.toContain('Strong month')
    expect(JSON.stringify(notice[0].values)).not.toContain('Protect 10:30')
  })

  it('a stale revision is a conflict that writes nothing — no event, no notification', async () => {
    useTx([[/UPDATE performance_reviews/, []]])
    expect(await shareReviewAction(shareReq())).toEqual({ error: M.conflict })
    expect(txCalls(/INSERT INTO/)).toHaveLength(0)
  })

  it('if the notification cannot be written the share fails as a whole', async () => {
    useTx([[/UPDATE performance_reviews/, [{ revision: 4, notes: 'x', agreed_actions: 'y' }]], [/INSERT INTO notifications/, () => { throw new Error('notifications down') }]])
    expect(await shareReviewAction(shareReq())).toEqual({ error: M.saveFailed })
    expect(console.error).toHaveBeenCalledWith('shareReviewAction failed', expect.any(Error))
  })
})

// ─── Acknowledge ──────────────────────────────────────────────────────────

const sharedRow = (over: Record<string, unknown> = {}) =>
  reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by: 'mgmt-1', shared_by_name: 'Alex', ...over })
const ackReq = (over: Partial<Parameters<typeof acknowledgeReviewAction>[0]> = {}) => ({ reviewId: 'r1', shareEventId: 'e2', note: 'Thanks, noted', ...over })

describe('acknowledgeReviewAction', () => {
  beforeEach(() => {
    asTeamLeader('tl-1')
    useSql([[/SELECT full_name FROM profiles/, [{ full_name: 'Taylor' }]], [/FROM performance_reviews/, [sharedRow()]]])
    useTx([[/UPDATE performance_reviews/, [{ revision: 4 }]]])
  })

  it('acknowledges the CURRENT share, records the comment on the event, and tells the sharer — in one transaction', async () => {
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ data: { revision: 4 } })
    const update = txCalls(/UPDATE performance_reviews/)[0]
    expect(update.text).toMatch(/status = 'acknowledged'/)
    expect(update.text).toMatch(/AND status = 'shared'/)
    expect(update.text).toMatch(/AND current_share_event_id = \?/)
    expect(update.values).toEqual(expect.arrayContaining(['r1', 'e2']))
    const event = txCalls(/INSERT INTO review_events/)[0]
    expect(event.text).toMatch(/'shared', 'acknowledged'/)
    expect(event.values).toEqual(expect.arrayContaining(['r1', 'tl-1', 'Taylor', 'Thanks, noted']))
    const notice = txCalls(/INSERT INTO notifications/)
    expect(notice).toHaveLength(1)
    expect(notice[0].values).toEqual(expect.arrayContaining(['mgmt-1', 'tl-1', 'Review acknowledged', 'Taylor has acknowledged their October review.']))
    expect(JSON.stringify(notice[0].values)).not.toContain('Thanks, noted') // the comment is not copied into a notification
  })

  it('THE RACE: the team leader opened version A (e2); the reviewer edited and re-shared (e5); the click on A is refused and writes nothing', async () => {
    useSql([[/SELECT full_name FROM profiles/, [{ full_name: 'Taylor' }]], [/FROM performance_reviews/, [sharedRow({ current_share_event_id: 'e5' })]]])
    expect(await acknowledgeReviewAction(ackReq({ shareEventId: 'e2' }))).toEqual({ error: M.staleShare })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('the race inside the transaction too: the review moved on between the read and the write', async () => {
    useTx([[/UPDATE performance_reviews/, []]]) // the guarded UPDATE matched nothing
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ error: M.staleShare })
    expect(txCalls(/INSERT INTO/)).toHaveLength(0)
  })

  it('an empty comment is stored as no comment; an over-long one is refused', async () => {
    await acknowledgeReviewAction(ackReq({ note: '  ' }))
    expect(txCalls(/INSERT INTO review_events/)[0].values).toContain(null)
    expect(await acknowledgeReviewAction(ackReq({ note: 'x'.repeat(1001) }))).toEqual({ error: M.commentTooLong })
  })

  it('only the review\'s own team leader may acknowledge: another team leader, management, a plain admin and an agent are refused', async () => {
    asTeamLeader('tl-2')
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ error: 'Forbidden' })
    asManagement()
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ error: 'Forbidden' })
    asHod()
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ error: 'Forbidden' })
    asPlainAdmin()
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ error: 'Forbidden' })
    asAgent()
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ error: 'Forbidden' })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('a review that is a draft, already acknowledged, or missing cannot be acknowledged', async () => {
    useSql([[/SELECT full_name FROM profiles/, [{ full_name: 'Taylor' }]], [/FROM performance_reviews/, [reviewRow({ status: 'draft' })]]])
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ error: M.notShared })
    useSql([[/SELECT full_name FROM profiles/, [{ full_name: 'Taylor' }]], [/FROM performance_reviews/, [sharedRow({ status: 'acknowledged' })]]])
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ error: M.illegalTransition })
    useSql([[/SELECT full_name FROM profiles/, [{ full_name: 'Taylor' }]], [/FROM performance_reviews/, []]])
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ error: 'Forbidden' }) // a missing review is not distinguishable from someone else's
  })

  it('sends no notification when the sharer has no id, or is the person acknowledging', async () => {
    useSql([[/SELECT full_name FROM profiles/, [{ full_name: 'Taylor' }]], [/FROM performance_reviews/, [sharedRow({ shared_by: null })]]])
    await acknowledgeReviewAction(ackReq())
    expect(txCalls(/INSERT INTO notifications/)).toHaveLength(0)
  })

  it('if the notification cannot be written the acknowledgement fails as a whole', async () => {
    useTx([[/UPDATE performance_reviews/, [{ revision: 4 }]], [/INSERT INTO notifications/, () => { throw new Error('down') }]])
    expect(await acknowledgeReviewAction(ackReq())).toEqual({ error: M.saveFailed })
  })

  it('a malformed request is refused without throwing', async () => {
    expect(await acknowledgeReviewAction(null as never)).toEqual({ error: M.notFound })
    expect(await acknowledgeReviewAction({ reviewId: 5, shareEventId: 'e2', note: null } as never)).toEqual({ error: M.notFound })
  })
})

// ─── Mark viewed ──────────────────────────────────────────────────────────

describe('markReviewViewedAction — the team leader\'s own screen only', () => {
  beforeEach(() => {
    asTeamLeader('tl-1')
    useSql([[/UPDATE performance_reviews/, [{ id: 'r1' }]]])
  })

  it('marks the share the team leader opened and writes nothing else (no revision bump, no event, no transaction)', async () => {
    expect(await markReviewViewedAction({ reviewId: 'r1', shareEventId: 'e2' })).toEqual({ data: { marked: true } })
    const update = mockSql.mock.calls.map(([s, ...v]) => ({ text: (s as string[]).join('?'), values: v })).find((c) => /UPDATE performance_reviews/.test(c.text))!
    expect(update.text).toMatch(/SET tl_viewed_event_id = \?/)
    expect(update.text).not.toMatch(/revision/)
    expect(update.text).toMatch(/AND tl_id = \?/)
    expect(update.text).toMatch(/AND current_share_event_id = \?/)
    expect(update.values).toEqual(expect.arrayContaining(['e2', 'r1', 'tl-1']))
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('reports marked: false when it is not the current share (a stale screen), without an error', async () => {
    useSql([[/UPDATE performance_reviews/, []]])
    expect(await markReviewViewedAction({ reviewId: 'r1', shareEventId: 'old' })).toEqual({ data: { marked: false } })
  })

  it('a reviewer previewing a review can never mark it viewed; neither can another team leader, a plain admin or an agent', async () => {
    for (const as of [asManagement, asHod, asPlainAdmin, asAgent]) {
      as()
      expect(await markReviewViewedAction({ reviewId: 'r1', shareEventId: 'e2' })).toEqual({ error: 'Forbidden' })
    }
    expect(mockSql).not.toHaveBeenCalled()
  })
})

// ─── Reopen ───────────────────────────────────────────────────────────────

describe('reopenReviewAction — HOD only, with a reason', () => {
  beforeEach(() => {
    asHod()
    useSql([[/FROM performance_reviews/, [reviewRow({ status: 'acknowledged', current_share_event_id: 'e2', shared_by: 'mgmt-1', shared_by_name: 'Alex' })]], [/SELECT full_name FROM profiles/, [{ full_name: 'Sam' }]]])
    useTx([[/UPDATE performance_reviews/, [{ revision: 6 }]]])
  })

  it.each([['management', asManagement], ['a team leader', () => asTeamLeader('tl-1')], ['a plain admin', asPlainAdmin], ['an agent', asAgent]])('is refused for %s', async (_n, as) => {
    as()
    expect(await reopenReviewAction({ reviewId: 'r1', reason: 'Fix the target' })).toEqual({ error: M.hodOnly })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('needs a non-blank reason', async () => {
    expect(await reopenReviewAction({ reviewId: 'r1', reason: '   ' })).toEqual({ error: M.reasonRequired })
    expect(await reopenReviewAction({ reviewId: 'r1', reason: undefined as never })).toEqual({ error: M.reasonRequired })
    expect(await reopenReviewAction({ reviewId: 'r1', reason: 'x'.repeat(1001) })).toEqual({ error: M.reasonTooLong })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('moves acknowledged -> draft, logs the reason, keeps the old acknowledgement in the history, and notifies the team leader and the sharer', async () => {
    expect(await reopenReviewAction({ reviewId: 'r1', reason: 'Add the VIP target' })).toEqual({ data: { revision: 6 } })
    const update = txCalls(/UPDATE performance_reviews/)[0]
    expect(update.text).toMatch(/status = 'draft'/)
    expect(update.text).toMatch(/AND status = 'acknowledged'/)
    expect(update.text).not.toMatch(/current_share_event_id/) // the pointer is kept so history reads correctly
    const event = txCalls(/INSERT INTO review_events/)[0]
    expect(event.text).toMatch(/'acknowledged', 'draft'/)
    expect(event.values).toEqual(expect.arrayContaining(['r1', 'hod-1', 'Sam', 'Add the VIP target']))
    const notices = txCalls(/INSERT INTO notifications/)
    expect(notices.map((n) => n.values[0])).toEqual(['tl-1', 'mgmt-1'])
    expect(notices[0].values).toEqual(expect.arrayContaining(['Your October review is being revised — it will be shared again.']))
    expect(notices[1].values).toEqual(expect.arrayContaining(["Taylor's October review has been reopened."]))
    expect(JSON.stringify(notices)).not.toContain('VIP target') // the reason is not copied into a notification
  })

  it('does not notify the sharer twice when the HOD is the sharer', async () => {
    useSql([[/FROM performance_reviews/, [reviewRow({ status: 'acknowledged', current_share_event_id: 'e2', shared_by: 'hod-1', shared_by_name: 'Sam' })]], [/SELECT full_name FROM profiles/, [{ full_name: 'Sam' }]]])
    await reopenReviewAction({ reviewId: 'r1', reason: 'Add the VIP target' })
    expect(txCalls(/INSERT INTO notifications/).map((n) => n.values[0])).toEqual(['tl-1'])
  })

  it('refuses a review that is not acknowledged, or that does not exist, and writes nothing', async () => {
    useSql([[/FROM performance_reviews/, [reviewRow({ status: 'shared', current_share_event_id: 'e2', shared_by_name: 'Alex' })]], [/SELECT full_name FROM profiles/, [{ full_name: 'Sam' }]]])
    expect(await reopenReviewAction({ reviewId: 'r1', reason: 'Why' })).toEqual({ error: M.illegalTransition })
    useSql([[/FROM performance_reviews/, []], [/SELECT full_name FROM profiles/, [{ full_name: 'Sam' }]]])
    expect(await reopenReviewAction({ reviewId: 'r1', reason: 'Why' })).toEqual({ error: M.notFound })
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('a failure after the status moved rolls everything back and is reported generically', async () => {
    useTx([[/UPDATE performance_reviews/, [{ revision: 6 }]], [/INSERT INTO notifications/, () => { throw new Error('down') }]])
    expect(await reopenReviewAction({ reviewId: 'r1', reason: 'Why' })).toEqual({ error: M.saveFailed })
    expect(console.error).toHaveBeenCalledWith('reopenReviewAction failed', expect.any(Error))
  })
})

describe('fetchReviewRosterAction', () => {
  it.each([['a team leader', () => asTeamLeader('tl-1')], ['a plain admin', asPlainAdmin], ['an agent', asAgent]])('refuses %s without touching the database', async (_n, as) => {
    as()
    expect(await fetchReviewRosterAction(PERIOD)).toEqual({ error: 'Forbidden' })
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('refuses a bad month before touching the database', async () => {
    asManagement()
    expect(await fetchReviewRosterAction('2026-10-15')).toEqual({ error: M.invalidMonth })
    expect(await fetchReviewRosterAction('2027-06-01')).toEqual({ error: M.outsideWindow })
    expect(mockSql).not.toHaveBeenCalled()
  })

  it.each([['management', asManagement], ['an HOD', asHod]])('lists the people for %s with that month\'s review status', async (_n, as) => {
    as()
    useSql([[/FROM profiles p/, [{ id: 'tl-1', name: 'Taylor', status: 'shared' }, { id: 'tl-2', name: 'Thabo', status: null }]]])
    expect(await fetchReviewRosterAction(PERIOD)).toEqual({ data: [{ id: 'tl-1', name: 'Taylor', status: 'shared' }, { id: 'tl-2', name: 'Thabo', status: null }] })
    const call = mockSql.mock.calls.map(([s, ...v]) => ({ text: (s as string[]).join('?'), values: v }))[0]
    expect(call.text).toMatch(/FROM team_leaders/)
    expect(call.text).toMatch(/r\.id IS NOT NULL/) // anyone who already has a review that month
    expect(call.values).toEqual(expect.arrayContaining([PERIOD]))
  })

  it('reports a failed query generically and logs it', async () => {
    asManagement()
    mockSql.mockRejectedValue(new Error('relation "performance_reviews" does not exist'))
    expect(await fetchReviewRosterAction(PERIOD)).toEqual({ error: M.loadFailed })
    expect(console.error).toHaveBeenCalledWith('fetchReviewRosterAction failed', expect.any(Error))
  })
})
