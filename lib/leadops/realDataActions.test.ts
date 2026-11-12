import { sql } from '@/lib/db/pool'
import { requireActiveUser } from '@/lib/auth/requireUser'
import { isSubmitterTeamLeader } from '@/lib/auth/authz'
import { EFFICIENCY_METRIC_DEFS, MANAGER_KPAS } from './constants'
import type { EfficiencyScore, ManagerKpaRating, TlTeamSize } from './types'
import {
  fetchLeadOpsRealDataAction,
  upsertEfficiencyScoreAction,
  upsertManagerKpaRatingAction,
  upsertManagerMonthlyReviewAction,
  upsertTlTeamSizeAction,
} from './realDataActions'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireActiveUser: jest.fn() }))
jest.mock('@/lib/auth/authz', () => ({ isSubmitterTeamLeader: jest.fn() }))

const mockSql = sql as unknown as jest.Mock
const mockRequireActiveUser = requireActiveUser as jest.Mock
const mockIsTeamLeader = isSubmitterTeamLeader as jest.Mock

const MANAGER_ID = 'mgr-1'
const REVIEWER_ID = 'hod-1'
const MONTH = '2026-10-01'
const METRIC = EFFICIENCY_METRIC_DEFS.find((d) => d.inputMode === 'manual')!.key
const RATED_KPA = MANAGER_KPAS.find((k) => k.method === 'rated')!.key
const ROLLUP_KPA = MANAGER_KPAS.find((k) => k.method === 'rollup')!.key

type Route = [RegExp, unknown | ((values: unknown[]) => unknown)]

/** Routes by SQL text rather than call order, so a test only states what it cares about. First match wins. */
function useSql(extra: Route[] = []) {
  const routes: Route[] = [
    ...extra,
    [/FROM profiles/, [{ id: MANAGER_ID, email: 'mgr@x.test' }, { id: REVIEWER_ID, email: 'rev@x.test' }]],
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
const asManager = () => signedInAs(MANAGER_ID, 'management')
const asHod = () => signedInAs(REVIEWER_ID, 'hod')
const asPlainAdmin = () => signedInAs('admin-1', 'admin')
const asAgent = () => signedInAs('agent-1', 'agent')

const scoreRow = {
  id: 's1', tl_id: 'tl-1', period: MONTH, metric_key: METRIC, self_value: '80', is_na: false, na_reason: null,
  verified_value: null, status: 'self_reported', verified_by: null, verified_at: null, verification_note: null, updated_at: 't',
}
const score = (over: Partial<EfficiencyScore> = {}): EfficiencyScore => ({
  id: 'client-id', tl_id: 'tl-1', period: MONTH, metric_key: METRIC, self_value: 80, is_na: false, na_reason: null,
  verified_value: null, status: 'self_reported', verified_by: null, verified_at: null, verification_note: null, updated_at: '', ...over,
})
const ratingRow = {
  manager_id: MANAGER_ID, month: MONTH, kpa_key: RATED_KPA, self_rating: '2', self_evidence: 'ev', reviewer_rating: '3',
  reviewer_comments: 'good', agreed_action: 'act', updated_at: 't',
}
const rating = (over: Partial<ManagerKpaRating> = {}): ManagerKpaRating => ({
  manager_id: MANAGER_ID, month: MONTH, kpa_key: RATED_KPA, self_rating: 1, self_evidence: 'mine', reviewer_rating: 1,
  reviewer_comments: 'mine', agreed_action: 'mine', updated_at: '', ...over,
})
const reviewRow = (status: string, over = {}) => ({
  id: 'r1', manager_id: MANAGER_ID, month: MONTH, reviewer_id: REVIEWER_ID, status, locked_snapshot: null, created_at: '', updated_at: '', ...over,
})

beforeEach(() => {
  mockSql.mockReset()
  // postgres.js's sql.json(value): tagged so a test can tell "the object was handed over as JSON" from "a string was passed".
  ;(mockSql as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => ({ __json: v })
  mockRequireActiveUser.mockReset()
  mockIsTeamLeader.mockReset()
  delete process.env.LEADOPS_ENABLED // no feature flag any more
  process.env.LEADOPS_MANAGER_EMAIL = 'mgr@x.test'
  process.env.LEADOPS_REVIEWER_EMAIL = 'rev@x.test'
  useSql()
})

describe('every action refuses when the caller is not signed in', () => {
  it('works with no feature flag set at all (authorisation is by session and role)', async () => {
    asManagement()
    const result = await fetchLeadOpsRealDataAction()
    expect(result.error).toBeUndefined()
    expect(result.data).toBeDefined()
  })

  it('not signed in', async () => {
    mockRequireActiveUser.mockResolvedValue({ error: 'Unauthorized' })
    expect(await fetchLeadOpsRealDataAction()).toEqual({ error: 'Unauthorized' })
    expect(await upsertEfficiencyScoreAction(score())).toEqual({ error: 'Unauthorized' })
  })
})

describe('fetchLeadOpsRealDataAction — what each role may read', () => {
  it('forbids an agent and a plain admin', async () => {
    asAgent()
    expect(await fetchLeadOpsRealDataAction()).toEqual({ error: 'Forbidden' })
    asPlainAdmin()
    expect(await fetchLeadOpsRealDataAction()).toEqual({ error: 'Forbidden' })
    expect(callsMatching(/efficiency_scores/)).toHaveLength(0)
  })

  it('a team leader only loads their own scores, never the manager tables', async () => {
    asTeamLeader('tl-1')
    useSql([[/FROM efficiency_scores/, [scoreRow]]])
    const result = await fetchLeadOpsRealDataAction()
    expect(result.data?.scores).toHaveLength(1)
    const scoreQuery = callsMatching(/FROM efficiency_scores/)[0]
    expect(scoreQuery.text).toContain('tl_id =')
    expect(scoreQuery.values).toContain('tl-1')
    expect(callsMatching(/manager_kpa_ratings|manager_monthly_reviews|tl_team_sizes/)).toHaveLength(0)
    expect(result.data?.managerKpaRatings).toEqual([])
  })

  it('management loads everything', async () => {
    asManagement()
    await fetchLeadOpsRealDataAction()
    expect(callsMatching(/FROM efficiency_scores/)).toHaveLength(1)
    expect(callsMatching(/FROM manager_kpa_ratings/)).toHaveLength(1)
    expect(callsMatching(/FROM manager_monthly_reviews/)).toHaveLength(1)
    expect(callsMatching(/FROM tl_team_sizes/)).toHaveLength(1)
  })

  const tlRows = [{ id: 'tl-1', full_name: 'TL One', team: 'Social' }, { id: 'tl-2', full_name: 'TL Two', team: 'T2' }]

  it('management also gets the real team leader list and the configured manager and reviewer', async () => {
    asManagement()
    useSql([
      [/string_agg/, tlRows],
      [/FROM profiles/, [{ id: MANAGER_ID, email: 'mgr@x.test', full_name: 'Alex' }, { id: REVIEWER_ID, email: 'rev@x.test', full_name: 'Sam' }]],
    ])
    const result = await fetchLeadOpsRealDataAction()
    expect(result.data?.teamLeaders).toEqual(tlRows)
    expect(result.data?.people).toEqual({ managerId: MANAGER_ID, managerName: 'Alex', reviewerId: REVIEWER_ID, reviewerName: 'Sam' })
    expect(result.data?.peopleError).toBeNull()
  })

  it('a missing manager/reviewer config does not block the KPI data, it is reported separately', async () => {
    asManagement()
    delete process.env.LEADOPS_MANAGER_EMAIL
    const result = await fetchLeadOpsRealDataAction()
    expect(result.error).toBeUndefined()
    expect(result.data?.people).toBeNull()
    expect(result.data?.peopleError).toBe('leadOps manager and reviewer are not configured.')
  })

  it('a team leader only gets their own team leader record, and no manager details', async () => {
    asTeamLeader('tl-1')
    useSql([[/string_agg/, [tlRows[0]]]])
    const result = await fetchLeadOpsRealDataAction()
    const tlQuery = callsMatching(/string_agg/)[0]
    expect(tlQuery.values).toContain('tl-1')
    expect(result.data?.teamLeaders).toEqual([tlRows[0]])
    expect(result.data?.people).toBeNull()
  })
})

describe('upsertEfficiencyScoreAction', () => {
  beforeEach(() => useSql([[/SELECT 1 FROM team_leaders/, [{ '?column?': 1 }]], [/INSERT INTO efficiency_scores/, [scoreRow]]]))

  it('forbids an agent and a plain admin', async () => {
    asAgent()
    expect(await upsertEfficiencyScoreAction(score())).toEqual({ error: 'Forbidden' })
    asPlainAdmin()
    expect(await upsertEfficiencyScoreAction(score())).toEqual({ error: 'Forbidden' })
    expect(callsMatching(/INSERT INTO efficiency_scores/)).toHaveLength(0)
  })

  it('a team leader cannot write another team leader\'s KPI', async () => {
    asTeamLeader('tl-2')
    expect(await upsertEfficiencyScoreAction(score({ tl_id: 'tl-1' }))).toEqual({ error: 'Forbidden' })
    expect(callsMatching(/INSERT INTO efficiency_scores/)).toHaveLength(0)
  })

  it('a team leader cannot self-verify: forged status/verifier are ignored', async () => {
    asTeamLeader('tl-1')
    await upsertEfficiencyScoreAction(score({ status: 'verified', verified_value: 99, verified_by: 'forged-user', verified_at: '2020-01-01T00:00:00Z', verification_note: 'trust me' }))
    const [insert] = callsMatching(/INSERT INTO efficiency_scores/)
    expect(insert.values).toContain('self_reported')
    expect(insert.values).not.toContain('verified')
    expect(insert.values).not.toContain('forged-user')
    expect(insert.values).not.toContain(99)
    expect(insert.values).not.toContain('trust me')
  })

  it('management verifies, and the verifier is the signed-in user, not the client-sent id', async () => {
    asManagement()
    await upsertEfficiencyScoreAction(score({ status: 'verified', verified_value: 75, verified_by: 'forged-alex', verified_at: '2020-01-01T00:00:00Z' }))
    const [insert] = callsMatching(/INSERT INTO efficiency_scores/)
    expect(insert.values).toContain('verified')
    expect(insert.values).toContain('mgmt-1')
    expect(insert.values).not.toContain('forged-alex')
    expect(insert.values).not.toContain('2020-01-01T00:00:00Z')
  })

  it('an edit by the team leader reverts a previous verification', async () => {
    asTeamLeader('tl-1')
    await upsertEfficiencyScoreAction(score({ self_value: 70, status: 'self_reported' }))
    const [insert] = callsMatching(/INSERT INTO efficiency_scores/)
    expect(insert.values).toContain('self_reported')
  })

  it('rejects the planner-derived KPIs: they are calculated, never entered', async () => {
    asManagement()
    const derived = EFFICIENCY_METRIC_DEFS.find((d) => d.inputMode === 'derived')!.key
    expect(await upsertEfficiencyScoreAction(score({ metric_key: derived }))).toEqual({ error: 'This KPI is calculated and cannot be entered.' })
    expect(callsMatching(/INSERT INTO efficiency_scores/)).toHaveLength(0)
  })

  it('rejects unknown KPIs, bad periods and N/A without a reason', async () => {
    asTeamLeader('tl-1')
    expect(await upsertEfficiencyScoreAction(score({ metric_key: 'made_up' }))).toEqual({ error: 'Unknown KPI.' })
    expect(await upsertEfficiencyScoreAction(score({ period: '2026-10-15' }))).toEqual({ error: 'Invalid period.' })
    expect(await upsertEfficiencyScoreAction(score({ is_na: true, na_reason: '  ' }))).toEqual({ error: 'A reason is required to mark a KPI as not applicable.' })
    expect(await upsertEfficiencyScoreAction(score({ self_value: Number.NaN }))).toEqual({ error: 'Invalid value.' })
    expect(callsMatching(/INSERT INTO efficiency_scores/)).toHaveLength(0)
  })

  it('management cannot write a score for someone who is not a team leader', async () => {
    asManagement()
    useSql([[/SELECT 1 FROM team_leaders/, []], [/INSERT INTO efficiency_scores/, [scoreRow]]])
    expect(await upsertEfficiencyScoreAction(score({ tl_id: 'not-a-tl' }))).toEqual({ error: 'That person is not a team leader.' })
    expect(callsMatching(/INSERT INTO efficiency_scores/)).toHaveLength(0)
  })
})

describe('upsertManagerKpaRatingAction', () => {
  beforeEach(() => useSql([
    [/INSERT INTO manager_kpa_ratings/, [ratingRow]],
    [/FROM manager_kpa_ratings/, [ratingRow]],
    [/FROM manager_monthly_reviews/, []],
  ]))

  it('rejects a rating for anyone but the configured manager', async () => {
    asManager()
    expect(await upsertManagerKpaRatingAction(rating({ manager_id: 'someone-else' }))).toEqual({ error: 'Forbidden' })
  })

  it('forbids a management user who is neither the manager nor the HOD', async () => {
    asManagement()
    expect(await upsertManagerKpaRatingAction(rating())).toEqual({ error: 'Forbidden' })
    expect(callsMatching(/INSERT INTO manager_kpa_ratings/)).toHaveLength(0)
  })

  it('the manager writes only the self fields; the reviewer\'s are kept from the database', async () => {
    asManager()
    await upsertManagerKpaRatingAction(rating({ self_rating: 3, reviewer_rating: 1, reviewer_comments: 'forged' }))
    const [insert] = callsMatching(/INSERT INTO manager_kpa_ratings/)
    expect(insert.values).toContain('3') // new self rating
    expect(insert.values).toContain('good') // reviewer comment preserved from the stored row
    expect(insert.values).not.toContain('forged')
  })

  it('the HOD writes only the reviewer fields; the self fields are kept from the database', async () => {
    asHod()
    await upsertManagerKpaRatingAction(rating({ self_rating: 1, self_evidence: 'forged', reviewer_rating: 2, reviewer_comments: 'better' }))
    const [insert] = callsMatching(/INSERT INTO manager_kpa_ratings/)
    expect(insert.values).toContain('better')
    expect(insert.values).toContain('ev') // stored self evidence
    expect(insert.values).not.toContain('forged')
  })

  it('refuses once the month is locked', async () => {
    asManager()
    useSql([[/FROM manager_monthly_reviews/, [reviewRow('locked')]], [/INSERT INTO manager_kpa_ratings/, [ratingRow]]])
    expect(await upsertManagerKpaRatingAction(rating())).toEqual({ error: 'This month is locked.' })
    expect(callsMatching(/INSERT INTO manager_kpa_ratings/)).toHaveLength(0)
  })

  it('only Rated KPAs and valid ratings and months are accepted', async () => {
    asManager()
    expect(await upsertManagerKpaRatingAction(rating({ kpa_key: ROLLUP_KPA }))).toEqual({ error: 'Unknown rated KPA.' })
    expect(await upsertManagerKpaRatingAction(rating({ self_rating: 7 as never }))).toEqual({ error: 'Invalid rating.' })
    expect(await upsertManagerKpaRatingAction(rating({ month: '2026-10-09' }))).toEqual({ error: 'Invalid month.' })
  })
})

describe('upsertTlTeamSizeAction', () => {
  const size = (over: Partial<TlTeamSize> = {}): TlTeamSize => ({ tl_id: 'tl-1', month: MONTH, agent_count: 12, confirmed: false, ...over })
  beforeEach(() => useSql([
    [/SELECT 1 FROM team_leaders/, [{ '?column?': 1 }]],
    [/INSERT INTO tl_team_sizes/, [{ tl_id: 'tl-1', month: MONTH, agent_count: 12, confirmed: true, updated_at: 't' }]],
    [/FROM manager_monthly_reviews/, []],
  ]))

  it('is management-tier only', async () => {
    asTeamLeader('tl-1')
    expect(await upsertTlTeamSizeAction(size())).toEqual({ error: 'Forbidden' })
    asAgent()
    expect(await upsertTlTeamSizeAction(size())).toEqual({ error: 'Forbidden' })
    expect(callsMatching(/INSERT INTO tl_team_sizes/)).toHaveLength(0)
  })

  it('saving always confirms the size, whatever the client sent', async () => {
    asManagement()
    await upsertTlTeamSizeAction(size({ confirmed: false }))
    const [insert] = callsMatching(/INSERT INTO tl_team_sizes/)
    expect(insert.values).toContain(true)
    expect(insert.values).not.toContain(false)
  })

  it('rejects negative or fractional counts and a locked month', async () => {
    asManagement()
    expect(await upsertTlTeamSizeAction(size({ agent_count: -1 }))).toEqual({ error: 'Invalid team size.' })
    expect(await upsertTlTeamSizeAction(size({ agent_count: 2.5 }))).toEqual({ error: 'Invalid team size.' })
    useSql([[/SELECT 1 FROM team_leaders/, [{ '?column?': 1 }]], [/FROM manager_monthly_reviews/, [reviewRow('locked')]]])
    expect(await upsertTlTeamSizeAction(size())).toEqual({ error: 'This month is locked.' })
  })
})

describe('upsertManagerMonthlyReviewAction — status transitions', () => {
  const insertedRow = (status: string) => [reviewRow(status)]

  it('refuses a manager id that is not the configured manager', async () => {
    asManager()
    expect(await upsertManagerMonthlyReviewAction('someone-else', MONTH, 'self_submitted')).toEqual({ error: 'Forbidden' })
  })

  it('the manager submits the self-assessment, creating the review with the configured reviewer', async () => {
    asManager()
    useSql([[/INSERT INTO manager_monthly_reviews/, insertedRow('self_submitted')], [/FROM manager_monthly_reviews/, []]])
    const result = await upsertManagerMonthlyReviewAction(MANAGER_ID, MONTH, 'self_submitted')
    expect(result.data?.status).toBe('self_submitted')
    const [insert] = callsMatching(/INSERT INTO manager_monthly_reviews/)
    expect(insert.values).toContain(REVIEWER_ID)
    expect(insert.values).toContain('self_submitted')
  })

  it('only the manager can submit the self-assessment', async () => {
    asHod()
    useSql([[/INSERT INTO manager_monthly_reviews/, insertedRow('self_submitted')], [/FROM manager_monthly_reviews/, []]])
    expect(await upsertManagerMonthlyReviewAction(MANAGER_ID, MONTH, 'self_submitted')).toEqual({ error: 'Forbidden' })
  })

  it('the HOD marks it reviewed, and the reviewer recorded is the HOD who clicked', async () => {
    asHod()
    useSql([[/INSERT INTO manager_monthly_reviews/, insertedRow('reviewed')], [/FROM manager_monthly_reviews/, [reviewRow('self_submitted', { reviewer_id: 'old-reviewer' })]]])
    await upsertManagerMonthlyReviewAction(MANAGER_ID, MONTH, 'reviewed')
    const [insert] = callsMatching(/INSERT INTO manager_monthly_reviews/)
    expect(insert.values).toContain(REVIEWER_ID)
    expect(insert.values).not.toContain('old-reviewer')
  })

  it('management who is not the HOD cannot review or lock', async () => {
    asManagement()
    useSql([[/INSERT INTO manager_monthly_reviews/, insertedRow('reviewed')], [/FROM manager_monthly_reviews/, [reviewRow('self_submitted')]]])
    expect(await upsertManagerMonthlyReviewAction(MANAGER_ID, MONTH, 'reviewed')).toEqual({ error: 'Forbidden' })
    expect(await upsertManagerMonthlyReviewAction(MANAGER_ID, MONTH, 'locked')).toEqual({ error: 'Forbidden' })
  })

  it('rejects skipped or backwards transitions', async () => {
    asHod()
    useSql([[/INSERT INTO manager_monthly_reviews/, insertedRow('reviewed')], [/FROM manager_monthly_reviews/, [reviewRow('draft')]]])
    expect(await upsertManagerMonthlyReviewAction(MANAGER_ID, MONTH, 'reviewed')).toEqual({ error: 'That status change is not allowed.' })
    expect(await upsertManagerMonthlyReviewAction(MANAGER_ID, MONTH, 'draft')).toEqual({ error: 'That status change is not allowed.' })
  })

  it('a locked month is final', async () => {
    asHod()
    useSql([[/INSERT INTO manager_monthly_reviews/, insertedRow('locked')], [/FROM manager_monthly_reviews/, [reviewRow('locked')]]])
    expect(await upsertManagerMonthlyReviewAction(MANAGER_ID, MONTH, 'reviewed')).toEqual({ error: 'This month is already locked.' })
    expect(callsMatching(/INSERT INTO manager_monthly_reviews/)).toHaveLength(0)
  })

  it('locking computes the snapshot on the server from database rows', async () => {
    asHod()
    useSql([
      [/INSERT INTO manager_monthly_reviews/, insertedRow('locked')],
      [/string_agg/, [{ id: 'tl-1', full_name: 'TL One', team: 'Social' }]],
      [/FROM efficiency_scores/, []],
      [/FROM tl_team_sizes/, []],
      [/FROM manager_kpa_ratings/, []],
      [/FROM manager_monthly_reviews/, [reviewRow('reviewed')]],
    ])
    await upsertManagerMonthlyReviewAction(MANAGER_ID, MONTH, 'locked')
    const [insert] = callsMatching(/INSERT INTO manager_monthly_reviews/)
    // The snapshot must reach postgres.js as an OBJECT through sql.json(): a pre-stringified string sent where the server
    // expects jsonb is JSON-encoded a second time and stored as a jsonb STRING, which the scorecard cannot read back.
    expect(insert.values.some((v) => typeof v === 'string' && v.trimStart().startsWith('{'))).toBe(false)
    const jsonParam = insert.values.find((v) => typeof v === 'object' && v !== null && '__json' in v) as { __json: Record<string, unknown> } | undefined
    expect(jsonParam).toBeDefined()
    const snapshot = jsonParam!.__json as { month: string; managerId: string; kpas: unknown[]; provisional: boolean }
    expect(snapshot.month).toBe(MONTH)
    expect(snapshot.managerId).toBe(MANAGER_ID)
    expect(snapshot.kpas).toHaveLength(MANAGER_KPAS.length)
    expect(snapshot.provisional).toBe(true) // no reviewer ratings yet
  })

  it('stores a plain SQL NULL snapshot for a non-lock transition, never a JSON null', async () => {
    asManager()
    useSql([[/INSERT INTO manager_monthly_reviews/, insertedRow('self_submitted')]])
    await upsertManagerMonthlyReviewAction(MANAGER_ID, MONTH, 'self_submitted')
    const [insert] = callsMatching(/INSERT INTO manager_monthly_reviews/)
    expect(insert.values).toContain(null)
    expect(insert.values.some((v) => typeof v === 'object' && v !== null && '__json' in v)).toBe(false)
  })

  it('has no way to accept a client-supplied snapshot', () => {
    expect(upsertManagerMonthlyReviewAction.length).toBeLessThanOrEqual(4) // (managerId, month, status, weighting?)
  })
})
