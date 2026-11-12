jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('./getCurrentUserId', () => ({ getCurrentUserId: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from './getCurrentUserId'
import { requireUser, isRestrictedT2Agent } from './requireUser'

const mockSql = sql as unknown as jest.Mock
const mockGetCurrentUserId = getCurrentUserId as jest.Mock

beforeEach(() => {
  mockSql.mockReset()
  mockGetCurrentUserId.mockReset()
})

describe('requireUser', () => {
  it('rejects when there is no session', async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    const result = await requireUser()

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('rejects when the profile no longer exists', async () => {
    mockGetCurrentUserId.mockResolvedValue('agent-1')
    mockSql.mockResolvedValueOnce([])

    const result = await requireUser()

    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('rejects a deactivated profile even with a live session - this is the only is_active re-check app/api/*.ts Route Handlers get, since proxy.ts does not gate them', async () => {
    mockGetCurrentUserId.mockResolvedValue('agent-1')
    mockSql.mockResolvedValueOnce([{ role: 'agent', t2_team: null, full_name: 'Agent One', is_active: false }])

    const result = await requireUser()

    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('returns the full auth shape for an active profile', async () => {
    mockGetCurrentUserId.mockResolvedValue('agent-1')
    mockSql.mockResolvedValueOnce([{ role: 'agent', t2_team: 'Voice', full_name: 'Agent One', is_active: true }])

    const result = await requireUser()

    expect(result).toEqual({ userId: 'agent-1', role: 'agent', t2Team: 'Voice', fullName: 'Agent One' })
  })
})

describe('isRestrictedT2Agent', () => {
  it('is true only for role agent with a t2Team set', () => {
    expect(isRestrictedT2Agent({ role: 'agent', t2Team: 'Voice' })).toBe(true)
    expect(isRestrictedT2Agent({ role: 'agent', t2Team: null })).toBe(false)
    expect(isRestrictedT2Agent({ role: 'team_leader', t2Team: 'Voice' })).toBe(false)
  })
})
