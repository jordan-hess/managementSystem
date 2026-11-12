jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/db/tx', () => ({ withTransaction: jest.fn() }))
jest.mock('@/lib/auth/getCurrentUserId', () => ({ getCurrentUserId: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { saveSettingsAction, countReviewsAffectedBySettings, createQueryCategoryAction, updateQueryCategoryAction } from './settingsActions'

const mockSql = sql as unknown as jest.Mock
const mockWithTransaction = withTransaction as jest.Mock
const mockGetCurrentUserId = getCurrentUserId as jest.Mock

beforeEach(() => {
  mockSql.mockReset()
  mockWithTransaction.mockReset()
  mockGetCurrentUserId.mockReset()
  ;(revalidatePath as jest.Mock).mockReset()
  mockWithTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockSql))
})

function mockRole(role: string, userId = 'user-1') {
  mockGetCurrentUserId.mockResolvedValue(userId)
  mockSql.mockResolvedValueOnce([{ role }])
}

const text = (call: unknown[]) => (call[0] as string[]).join('?')
const callsMatching = (re: RegExp) => mockSql.mock.calls.filter((c) => Array.isArray(c[0]) && re.test(text(c)))

const seed = { id: 'settings-seed', pass_mark: '75.00', excellent_from: '85.00', critical_fail_cap: '60.00', effective_from: '1900-01-01' }
const later = { id: 'settings-later', pass_mark: '75.00', excellent_from: '85.00', critical_fail_cap: '60.00', effective_from: '2026-11-15' }
const fresh = { id: 'settings-new', pass_mark: '70.00', excellent_from: '90.00', critical_fail_cap: '50.00', effective_from: '2026-11-01' }

const input = { passMark: 70, excellentFrom: 90, criticalFailCap: 50, effectiveFrom: '2026-11-01' }

const CODES = ['C1', 'C2', 'C3', 'B1', 'B2', 'B3', 'B4', 'Q1', 'Q2', 'Q3', 'Q4']
const itemRows = (reviewId: string) =>
  CODES.map((c) => ({ review_id: reviewId, item_code: c, written_value: c.startsWith('Q') ? '5' : 'yes', call_value: 'na' }))

describe('saveSettingsAction', () => {
  it('rejects non-manager', async () => {
    mockRole('qa_analyst')
    expect(await saveSettingsAction(input)).toEqual({ error: 'Forbidden' })
    expect(mockWithTransaction).not.toHaveBeenCalled()
  })

  it('rejects passMark >= excellentFrom', async () => {
    mockRole('admin')
    expect(await saveSettingsAction({ ...input, passMark: 90 })).toEqual({ error: 'Pass mark must be below Excellent-from.' })
    expect(mockWithTransaction).not.toHaveBeenCalled()
  })

  it('takes SHARE ROW EXCLUSIVE lock first', async () => {
    mockRole('admin')
    mockSql
      .mockResolvedValueOnce([]) // LOCK
      .mockResolvedValueOnce([{ id: 'settings-new' }]) // upsert
      .mockResolvedValueOnce([seed, fresh]) // reload
      .mockResolvedValueOnce([]) // reviews
    await saveSettingsAction(input)
    expect(text(mockSql.mock.calls[1])).toMatch(/LOCK TABLE qa_settings IN SHARE ROW EXCLUSIVE MODE/)
  })

  it('same-date save updates in place', async () => {
    mockRole('admin')
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'settings-seed' }]) // existing id returned
      .mockResolvedValueOnce([seed])
      .mockResolvedValueOnce([{ id: 'r-1', legs: 'written', interaction_date: '2026-01-05' }])
      .mockResolvedValueOnce(itemRows('r-1'))
      .mockResolvedValue([])
    const res = await saveSettingsAction({ ...input, effectiveFrom: '1900-01-01' })
    expect(res).toEqual({ rescored: 1 })
    const [upsert] = callsMatching(/INSERT INTO qa_settings/)
    expect(text(upsert)).toMatch(/ON CONFLICT \(effective_from\) DO UPDATE/)
    expect(callsMatching(/INSERT INTO qa_settings/)).toHaveLength(1)
    const [update] = callsMatching(/UPDATE qa_reviews/)
    expect(update.slice(1).flat()).toContain('settings-seed')
    expect(update.slice(1).join('|')).toContain('"id":"r-1"')
  })

  it('rounds to 2 dp before validating (84.999 rounds to 85, so pass 85 is not below it)', async () => {
    mockRole('admin')
    expect(await saveSettingsAction({ ...input, passMark: 85, excellentFrom: 84.999 })).toEqual({ error: 'Pass mark must be below Excellent-from.' })
  })

  it('stores the rounded values', async () => {
    mockRole('admin')
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'settings-new' }])
      .mockResolvedValueOnce([seed, fresh])
      .mockResolvedValueOnce([])
    expect(await saveSettingsAction({ ...input, passMark: 69.996, excellentFrom: 90.004, criticalFailCap: 49.999 })).toEqual({ rescored: 0 })
    const [upsert] = callsMatching(/INSERT INTO qa_settings/)
    expect(upsert).toEqual(expect.arrayContaining([70, 90, 50]))
  })

  it("rescores only reviews in the new row's window", async () => {
    mockRole('admin')
    const review = (id: string, d: string) => ({ id, legs: 'written', interaction_date: d })
    mockSql
      .mockResolvedValueOnce([]) // LOCK
      .mockResolvedValueOnce([{ id: 'settings-new' }]) // upsert
      .mockResolvedValueOnce([seed, fresh, later]) // reload
      .mockResolvedValueOnce([review('r-nov', '2026-11-05')]) // the DB applies the window; SQL text asserted below
      .mockResolvedValueOnce(itemRows('r-nov'))
      .mockResolvedValue([])

    const res = await saveSettingsAction(input)

    expect(res).toEqual({ rescored: 1 })
    const select = callsMatching(/FROM qa_reviews/)[0]
    expect(select).toContain('2026-11-01')
    expect(select).toContain('2026-11-15')
    expect(text(select)).toMatch(/interaction_date >= \?::date\s+AND \(\?::date IS NULL OR interaction_date < \?::date\)/)
    const [update] = callsMatching(/UPDATE qa_reviews/)
    const params = update.slice(1).flat()
    expect(params.join('|')).toContain('"id":"r-nov"')
    expect(params.join('|')).not.toContain('r-oct')
    expect(params.join('|')).not.toContain('r-dec')
    expect(params).toContain('settings-new')
    expect(callsMatching(/UPDATE qa_review_items/)).toHaveLength(1)
    expect(revalidatePath).toHaveBeenCalledWith('/qa-reviews/settings')
    expect(revalidatePath).toHaveBeenCalledWith('/qa-reviews')
  })
})

describe('countReviewsAffectedBySettings', () => {
  it('rejects non-manager', async () => {
    mockRole('agent')
    expect(await countReviewsAffectedBySettings('2026-11-01')).toEqual({ error: 'Forbidden' })
  })

  it('counts reviews in the window', async () => {
    mockRole('admin')
    mockSql.mockResolvedValueOnce([seed, later]).mockResolvedValueOnce([{ count: 4 }])
    expect(await countReviewsAffectedBySettings('2026-11-01')).toEqual({ count: 4 })
    const count = callsMatching(/count\(\*\)/i)[0]
    expect(count).toContain('2026-11-01')
    expect(count).toContain('2026-11-15')
  })
})

describe('query category actions', () => {
  it('only lets admin/management manage categories', async () => {
    mockRole('qa_analyst')
    expect(await createQueryCategoryAction({ department: 'Social', name: 'Network' })).toEqual({ error: 'Forbidden' })
  })

  it('adds a trimmed category to the end of its department', async () => {
    mockRole('admin')
    mockSql.mockResolvedValueOnce([{ id: 'cat-1' }])

    expect(await createQueryCategoryAction({ department: 'T2', name: '  Porting  ' })).toEqual({ id: 'cat-1' })
    const [insert] = callsMatching(/INSERT INTO qa_query_categories/)
    expect(insert).toContain('Porting')
    expect(insert).toContain('T2')
    expect(revalidatePath).toHaveBeenCalledWith('/qa-reviews')
  })

  it('rejects a blank name or unknown department before touching the database', async () => {
    mockRole('admin')
    expect(await createQueryCategoryAction({ department: 'Social', name: '   ' })).toEqual({ error: 'Category name is required.' })
    mockRole('admin')
    expect(await createQueryCategoryAction({ department: 'Ops' as never, name: 'X' })).toEqual({ error: 'Invalid department.' })
    expect(callsMatching(/qa_query_categories/)).toHaveLength(0)
  })

  it('turns a duplicate name into a friendly error', async () => {
    mockRole('admin')
    mockSql.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))
    expect(await createQueryCategoryAction({ department: 'Social', name: 'network' })).toEqual({ error: 'That category already exists for this department.' })
  })

  it('renames or deactivates, leaving the untouched field as it is', async () => {
    mockRole('admin')
    mockSql.mockResolvedValueOnce([{ id: 'cat-1' }])

    expect(await updateQueryCategoryAction({ id: 'cat-1', isActive: false })).toEqual({ ok: true })
    const [update] = callsMatching(/UPDATE qa_query_categories/)
    expect(update.slice(1)).toEqual([null, false, 'cat-1'])
  })

  it('reports a missing category', async () => {
    mockRole('admin')
    mockSql.mockResolvedValueOnce([])
    expect(await updateQueryCategoryAction({ id: 'nope', name: 'X' })).toEqual({ error: 'Category not found.' })
  })
})
