jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/db/tx', () => ({ withTransaction: jest.fn() }))
jest.mock('@/lib/auth/getCurrentUserId', () => ({ getCurrentUserId: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { createReviewAction, deleteReviewAction, updateReviewAction, type SaveReviewInput, type ReviewItemInput } from './actions'
import type { ItemCode, LegValue } from '@/lib/qa/scorecard'

const mockSql = sql as unknown as jest.Mock
const mockWithTransaction = withTransaction as jest.Mock
const mockGetCurrentUserId = getCurrentUserId as jest.Mock

beforeEach(() => {
  mockSql.mockReset()
  mockWithTransaction.mockReset()
  mockGetCurrentUserId.mockReset()
  mockWithTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockSql))
})

function mockRole(role: string, userId = 'user-1') {
  mockGetCurrentUserId.mockResolvedValue(userId)
  mockSql.mockResolvedValueOnce([{ role }]) // requireUser()'s local profile lookup
}

const settingsRow = { id: 'settings-seed', pass_mark: '75.00', excellent_from: '85.00', critical_fail_cap: '60.00', effective_from: '1900-01-01' }

const CODES: ItemCode[] = ['C1', 'C2', 'C3', 'B1', 'B2', 'B3', 'B4', 'Q1', 'Q2', 'Q3', 'Q4']

function items(overrides: Partial<Record<ItemCode, [LegValue, LegValue]>> = {}): ReviewItemInput[] {
  return CODES.map((code) => {
    const base: [LegValue, LegValue] = code.startsWith('Q') ? [5, null] : ['yes', null]
    const [written, call] = overrides[code] ?? base
    return { code, written, call, comments: null, evidence: null }
  })
}

// Spec case B: written only, B2 No + B3 No, everything else full marks => 85 Excellent, closing line 'No'.
const caseBItems = items({ B2: ['no', null], B3: ['no', null] })

const baseInput: SaveReviewInput = {
  agentId: 'agent-1',
  legs: 'written',
  department: 'Social',
  interactionDate: '2026-09-18',
  reviewDate: '2026-09-18',
  categoryId: null,
  interactionType: null,
  ticketReference: null,
  callReference: null,
  customerReference: null,
  secondaryAgentName: null,
  overallComments: null,
  items: caseBItems,
  reasonTags: [],
  coachingFlags: [],
  fcr: null,
  rootCauseTypeId: null,
  gapIdentified: null,
  solution: null,
}

const text = (call: unknown[]) => (call[0] as string[]).join('?')
const callsMatching = (re: RegExp) => mockSql.mock.calls.filter((c) => Array.isArray(c[0]) && re.test(text(c)))

describe('createReviewAction', () => {
  it('create stores spec case B as 85 Excellent', async () => {
    mockRole('qa_analyst')
    mockSql
      .mockResolvedValueOnce([]) // LOCK
      .mockResolvedValueOnce([settingsRow])
      .mockResolvedValueOnce([{ id: 'review-1' }]) // INSERT qa_reviews

    const result = await createReviewAction(baseInput)

    expect(result).toEqual({ id: 'review-1' })
    const [insert] = callsMatching(/INSERT INTO qa_reviews/)
    expect(insert).toContain(85)
    expect(insert).toContain('Excellent')
    expect(insert).toContain('No') // closing_line
    expect(insert).toContain('settings-seed')
    expect(insert).toContain('user-1') // reviewer_id = caller
    expect(callsMatching(/INSERT INTO qa_review_items/)).toHaveLength(11)
  })

  it('takes SHARE lock on qa_settings before reading it', async () => {
    mockRole('qa_analyst')
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([settingsRow])
      .mockResolvedValueOnce([{ id: 'review-1' }])

    await createReviewAction(baseInput)

    expect(text(mockSql.mock.calls[1])).toMatch(/LOCK TABLE qa_settings IN SHARE MODE/)
    expect(text(mockSql.mock.calls[2])).toMatch(/FROM qa_settings/)
  })

  it('forces call leg to N/A when legs is written', async () => {
    mockRole('qa_analyst')
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([settingsRow])
      .mockResolvedValueOnce([{ id: 'review-1' }])

    await createReviewAction({ ...baseInput, legs: 'written', items: items({ C1: ['yes', 'no'] }) })

    const c1 = callsMatching(/INSERT INTO qa_review_items/).find((c) => c.includes('C1'))!
    expect(c1.slice(1, 5)).toEqual(['review-1', 'C1', 'yes', 'na'])
    const [insert] = callsMatching(/INSERT INTO qa_reviews/)
    expect(insert).not.toContain('Fail (Critical)')
    expect(insert).not.toContain(true) // critical_fail false
  })

  it('rejects unanswered critical on an active leg', async () => {
    mockRole('qa_analyst')
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([settingsRow])

    expect(await createReviewAction({ ...baseInput, items: items({ C2: [null, null] }) })).toEqual({ error: 'Critical items must be answered on every leg that happened' })
  })

  it('rejects an illegal value for the section', async () => {
    mockRole('qa_analyst')
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([settingsRow])

    expect(await createReviewAction({ ...baseInput, items: items({ Q1: ['yes', null] }) })).toEqual({ error: expect.stringMatching(/Q1/) })
  })

  it('rejects reason tag on item without a No', async () => {
    mockRole('qa_analyst')
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([settingsRow])
      .mockResolvedValueOnce([{ id: 'tag-1', name: 'Privacy violation', item_code: 'C1', requires_coaching: false }])

    expect(await createReviewAction({ ...baseInput, reasonTags: [{ typeId: 'tag-1' }] })).toEqual({ error: expect.stringMatching(/reason tag/i) })
  })

  it('rejects a root cause without notes', async () => {
    mockRole('qa_analyst')
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([settingsRow])

    expect(await createReviewAction({ ...baseInput, coachingFlags: [{ typeId: 'flag-1', notes: '  ' }] })).toEqual({ error: 'A root cause requires notes.' })
  })

  it('accepts any critical-failure type as the root cause, including a reason-tag type', async () => {
    mockRole('qa_analyst')
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([settingsRow])
      .mockResolvedValueOnce([{ id: 'tag-1', name: 'Privacy violation', item_code: 'C1', requires_coaching: false }])
      .mockResolvedValueOnce([{ id: 'review-1' }])

    expect(await createReviewAction({ ...baseInput, rootCauseTypeId: 'tag-1' })).toEqual({ id: 'review-1' })
    expect(callsMatching(/INSERT INTO qa_reviews/)[0]).toContain('tag-1')
  })

  it('captures the agent\'s team leader at save time', async () => {
    mockRole('qa_analyst')
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([settingsRow]).mockResolvedValueOnce([{ id: 'review-1' }])

    await createReviewAction(baseInput)

    const [insert] = callsMatching(/INSERT INTO qa_reviews/)
    expect(text(insert)).toMatch(/team_leader_id[\s\S]*SELECT tl\.profile_id FROM team_members tm JOIN team_leaders tl/)
    expect(insert).toContain('agent-1')
  })

  it('stores a category from the review\'s department', async () => {
    mockRole('qa_analyst')
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([settingsRow])
      .mockResolvedValueOnce([{ department: 'Social', is_active: true }])
      .mockResolvedValueOnce([{ id: 'review-1' }])

    expect(await createReviewAction({ ...baseInput, categoryId: 'cat-1', interactionType: 'Fibre outage' })).toEqual({ id: 'review-1' })
    const [insert] = callsMatching(/INSERT INTO qa_reviews/)
    expect(insert).toContain('cat-1')
    expect(insert).toContain('Fibre outage')
  })

  it.each([
    [[], /category not found/i],
    [[{ department: 'T2', is_active: true }], /does not belong/i],
    [[{ department: 'Social', is_active: false }], /no longer in use/i],
  ])('rejects a category that is missing, from another department or inactive', async (categoryRows, error) => {
    mockRole('qa_analyst')
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([settingsRow]).mockResolvedValueOnce(categoryRows)

    expect(await createReviewAction({ ...baseInput, categoryId: 'cat-1' })).toEqual({ error: expect.stringMatching(error) })
  })

  it('rejects a reason tag whose type is coaching-only', async () => {
    mockRole('qa_analyst')
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([settingsRow])
      .mockResolvedValueOnce([{ id: 'flag-1', name: 'Knowledge gap', item_code: null, requires_coaching: true }])

    expect(await createReviewAction({ ...baseInput, reasonTags: [{ typeId: 'flag-1' }] })).toEqual({ error: expect.stringMatching(/not a reason tag/i) })
  })

  it('rejects a coaching flag whose type is a reason-tag type', async () => {
    mockRole('qa_analyst')
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([settingsRow])
      .mockResolvedValueOnce([{ id: 'tag-1', name: 'Privacy violation', item_code: 'C1', requires_coaching: false }])

    expect(await createReviewAction({ ...baseInput, coachingFlags: [{ typeId: 'tag-1', notes: 'x' }] })).toEqual({ error: expect.stringMatching(/not a root cause/i) })
  })

  it('rejects non-reviewer', async () => {
    mockRole('agent')

    expect(await createReviewAction(baseInput)).toEqual({ error: 'Forbidden' })
    expect(mockWithTransaction).not.toHaveBeenCalled()
  })

  it('writes reason tags with null notes and coaching flags with notes', async () => {
    mockRole('qa_analyst')
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([settingsRow])
      .mockResolvedValueOnce([
        { id: 'tag-1', name: 'Privacy violation', item_code: 'C1', requires_coaching: false },
        { id: 'flag-1', name: 'Knowledge gap', item_code: null, requires_coaching: true },
      ])
      .mockResolvedValueOnce([{ id: 'review-1' }])

    await createReviewAction({
      ...baseInput,
      items: items({ C1: ['no', null] }),
      reasonTags: [{ typeId: 'tag-1' }],
      coachingFlags: [{ typeId: 'flag-1', notes: 'needs refresher' }],
      rootCauseTypeId: 'flag-1',
    })

    const rows = callsMatching(/INSERT INTO qa_review_critical_failures/)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('tag-1')
    expect(rows[0]).toContain(null)
    expect(rows[1]).toContain('needs refresher')
  })
})

describe('updateReviewAction', () => {
  const existingReview = {
    reviewer_id: 'user-1', legs: 'written', department: 'Social', interaction_date: '2026-09-18', review_date: '2026-09-18',
    category_id: null, interaction_type: null, ticket_reference: null, customer_reference: null, call_reference: null,
    secondary_agent_name: null, overall_comments: null, fcr: null, root_cause_type_id: null, gap_identified: null, solution: null,
  }

  it('rejects editor who is not reviewer or admin', async () => {
    mockRole('qa_analyst')
    mockSql.mockResolvedValueOnce([{ ...existingReview, reviewer_id: 'someone-else' }])

    expect(await updateReviewAction({ ...baseInput, id: 'review-1' })).toEqual({ error: 'Forbidden' })
  })

  it('errors when the review does not exist', async () => {
    mockRole('qa_analyst')
    mockSql.mockResolvedValueOnce([])

    expect(await updateReviewAction({ ...baseInput, id: 'review-1' })).toEqual({ error: 'Review not found.' })
  })

  it('update logs B2:call change when the stored yes becomes no', async () => {
    mockRole('qa_analyst')
    const stored = CODES.map((code) => ({
      item_code: code,
      written_value: code.startsWith('Q') ? '5' : 'yes',
      call_value: code === 'B2' ? 'yes' : 'na',
      comments: null,
      evidence: null,
    }))
    mockSql
      .mockResolvedValueOnce([{ ...existingReview, legs: 'both' }]) // existing review
      .mockResolvedValueOnce([]) // LOCK
      .mockResolvedValueOnce([settingsRow])
      .mockResolvedValueOnce(stored) // previous items
      .mockResolvedValueOnce([]) // previous critical failures

    await updateReviewAction({
      ...baseInput,
      id: 'review-1',
      legs: 'both',
      items: items({
        C1: ['yes', 'na'], C2: ['yes', 'na'], C3: ['yes', 'na'],
        B1: ['yes', 'na'], B2: ['yes', 'no'], B3: ['yes', 'na'], B4: ['yes', 'na'],
        Q1: [5, 'na'], Q2: [5, 'na'], Q3: [5, 'na'], Q4: [5, 'na'],
      }),
    })

    const audits = callsMatching(/INSERT INTO qa_audit_log/)
    const b2 = audits.filter((c) => c.includes('B2:call'))
    expect(b2).toHaveLength(1)
    expect(b2[0]).toContain('yes')
    expect(b2[0]).toContain('no')
    expect(audits.filter((c) => c.includes('B2:written'))).toHaveLength(0)
    // legs unchanged in existing ('both'); no header entry for legs
    expect(audits.some((c) => c.includes('legs'))).toBe(false)
    expect(callsMatching(/UPDATE qa_reviews/)).toHaveLength(1)
  })
})

describe('deleteReviewAction', () => {
  it('lets the author delete their own review', async () => {
    mockRole('qa_analyst', 'qa-1')
    mockSql.mockResolvedValueOnce([{ reviewer_id: 'qa-1' }]).mockResolvedValueOnce([])
    expect(await deleteReviewAction('review-1')).toEqual({})
    expect(callsMatching(/DELETE FROM qa_reviews/)).toHaveLength(1)
  })

  it("blocks a qa_analyst from deleting another reviewer's review", async () => {
    mockRole('qa_analyst', 'qa-2')
    mockSql.mockResolvedValueOnce([{ reviewer_id: 'qa-1' }])
    expect(await deleteReviewAction('review-1')).toEqual({ error: 'Forbidden' })
    expect(callsMatching(/DELETE FROM qa_reviews/)).toHaveLength(0)
  })

  it('lets management delete any review', async () => {
    mockRole('management', 'mgr-1')
    mockSql.mockResolvedValueOnce([{ reviewer_id: 'qa-1' }]).mockResolvedValueOnce([])
    expect(await deleteReviewAction('review-1')).toEqual({})
    expect(callsMatching(/DELETE FROM qa_reviews/)).toHaveLength(1)
  })

  it('returns an error for a missing review', async () => {
    mockRole('admin')
    mockSql.mockResolvedValueOnce([])
    expect(await deleteReviewAction('review-1')).toEqual({ error: 'Review not found.' })
  })
})
