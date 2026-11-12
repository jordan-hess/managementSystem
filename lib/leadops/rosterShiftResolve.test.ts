import { sql } from '@/lib/db/pool'
import { resolveRosterShift } from './rosterShiftResolve'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
const mockSql = sql as unknown as jest.Mock

beforeEach(() => mockSql.mockReset())

describe('resolveRosterShift', () => {
  it('reports a missing team leader profile', async () => {
    mockSql.mockResolvedValue([])
    expect(await resolveRosterShift('tl-1', '2026-10-12')).toEqual({ error: 'Team leader profile not found' })
  })

  it('reports a failed lookup without throwing', async () => {
    mockSql.mockRejectedValue(new Error('db down'))
    jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await resolveRosterShift('tl-1', '2026-10-12')).toEqual({ error: 'Could not resolve this team leader’s shift.' })
    jest.restoreAllMocks()
  })
})
