import { sql } from '@/lib/db/pool'
import { requireActiveUser } from '@/lib/auth/requireUser'
import { isSubmitterTeamLeader } from '@/lib/auth/authz'
import { requireLeadOps, resolveLeadOpsPeople } from './serverGuard'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireActiveUser: jest.fn() }))
jest.mock('@/lib/auth/authz', () => ({ isSubmitterTeamLeader: jest.fn() }))

const mockSql = sql as unknown as jest.Mock
const mockRequireActiveUser = requireActiveUser as jest.Mock
const mockIsTeamLeader = isSubmitterTeamLeader as jest.Mock

beforeEach(() => {
  mockSql.mockReset()
  mockRequireActiveUser.mockReset()
  mockIsTeamLeader.mockReset()
  // leadOps has no on/off feature flag any more: an environment that still has the
  // old variable set (or not) must behave identically.
  delete process.env.LEADOPS_ENABLED
  process.env.LEADOPS_MANAGER_EMAIL = 'Mgr@X.test'
  process.env.LEADOPS_REVIEWER_EMAIL = ' rev@x.test '
})

describe('requireLeadOps', () => {
  it('does not depend on any feature-flag variable, whether it is unset, true or false', async () => {
    mockRequireActiveUser.mockResolvedValue({ userId: 'u1', role: 'management', t2Team: null, fullName: 'U', forcePasswordChange: false })
    mockIsTeamLeader.mockResolvedValue(false)
    for (const value of [undefined, 'true', 'false']) {
      if (value === undefined) delete process.env.LEADOPS_ENABLED
      else process.env.LEADOPS_ENABLED = value
      expect(await requireLeadOps()).toEqual({ userId: 'u1', viewer: { role: 'management', hasTeamRow: false, profileId: 'u1' } })
    }
  })

  it('refuses when there is no active signed-in account', async () => {
    mockRequireActiveUser.mockResolvedValue({ error: 'Unauthorized' })
    expect(await requireLeadOps()).toEqual({ error: 'Unauthorized' })
  })

  it('builds the viewer context the permission predicates expect, including team-leader membership', async () => {
    mockRequireActiveUser.mockResolvedValue({ userId: 'u1', role: 'admin', t2Team: null, fullName: 'U', forcePasswordChange: false })
    mockIsTeamLeader.mockResolvedValue(true)
    expect(await requireLeadOps()).toEqual({ userId: 'u1', viewer: { role: 'admin', hasTeamRow: true, profileId: 'u1' } })
    expect(mockIsTeamLeader).toHaveBeenCalledWith('u1')
  })
})

describe('resolveLeadOpsPeople', () => {
  it('needs both emails configured, and does not query the database without them', async () => {
    delete process.env.LEADOPS_REVIEWER_EMAIL
    expect(await resolveLeadOpsPeople()).toEqual({ error: 'leadOps manager and reviewer are not configured.' })
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('matches emails case-insensitively and ignores surrounding spaces, returning ids and names', async () => {
    mockSql.mockResolvedValue([
      { id: 'm1', email: 'mgr@x.test', full_name: 'Alex Morgan' },
      { id: 'r1', email: 'rev@x.test', full_name: 'Sam Rivera' },
    ])
    expect(await resolveLeadOpsPeople()).toEqual({ managerId: 'm1', managerName: 'Alex Morgan', reviewerId: 'r1', reviewerName: 'Sam Rivera' })
    const [, emails] = mockSql.mock.calls[0]
    expect(emails).toEqual(['mgr@x.test', 'rev@x.test'])
  })

  it('reports a missing or inactive account instead of guessing', async () => {
    mockSql.mockResolvedValue([{ id: 'm1', email: 'mgr@x.test', full_name: 'Alex Morgan' }])
    expect(await resolveLeadOpsPeople()).toEqual({ error: 'leadOps manager or reviewer account was not found.' })
  })
})
