jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/getCurrentUserId', () => ({ getCurrentUserId: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { createCaseCategory, updateCaseCategory } from './actions'

const mockSql = sql as unknown as jest.Mock
const mockGetCurrentUserId = getCurrentUserId as jest.Mock

beforeEach(() => {
  mockSql.mockReset()
  mockGetCurrentUserId.mockReset()
  mockGetCurrentUserId.mockResolvedValue('u1')
})

describe('case category duplicate-name errors name the field', () => {
  const duplicate = new Error('duplicate key value violates unique constraint "case_categories_name_key"')

  it('createCaseCategory tags a duplicate name with field "name"', async () => {
    mockSql.mockResolvedValueOnce([{ role: 'admin' }]).mockRejectedValueOnce(duplicate)
    expect(await createCaseCategory('Billing')).toEqual({ error: 'A category with this name already exists.', field: 'name' })
  })

  it('updateCaseCategory tags a duplicate name with field "name"', async () => {
    mockSql.mockResolvedValueOnce([{ role: 'admin' }]).mockRejectedValueOnce(duplicate)
    expect(await updateCaseCategory('c1', 'Billing')).toEqual({ error: 'A category with this name already exists.', field: 'name' })
  })

  it('leaves other failures without a field', async () => {
    mockSql.mockResolvedValueOnce([{ role: 'admin' }]).mockRejectedValueOnce(new Error('db down'))
    expect(await createCaseCategory('Billing')).toEqual({ error: 'db down' })
  })
})
