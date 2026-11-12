import { sql } from '@/lib/db/pool'
import { requireActiveUser } from '@/lib/auth/requireUser'
import { isSubmitterTeamLeader } from '@/lib/auth/authz'
import { resolveTeamLeaderShiftAction } from './rosterShiftAction'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireActiveUser: jest.fn() }))
jest.mock('@/lib/auth/authz', () => ({ isSubmitterTeamLeader: jest.fn() }))

const mockSql = sql as unknown as jest.Mock
const mockRequireActiveUser = requireActiveUser as jest.Mock
const mockIsTeamLeader = isSubmitterTeamLeader as jest.Mock

function signedInAs(userId: string, role: string, hasTeamRow = false) {
  mockRequireActiveUser.mockResolvedValue({ userId, role, t2Team: null, fullName: userId, forcePasswordChange: false })
  mockIsTeamLeader.mockResolvedValue(hasTeamRow)
}

beforeEach(() => {
  mockSql.mockReset()
  mockSql.mockResolvedValue([]) // no profile found: an allowed caller gets "not found", a refused one never reaches the database
  delete process.env.LEADOPS_ENABLED // no feature flag any more
})

describe('resolveTeamLeaderShiftAction — authorisation', () => {
  it('works with no feature flag set at all', async () => {
    signedInAs('mgmt-1', 'management')
    expect(await resolveTeamLeaderShiftAction('tl-1', '2026-10-12')).toEqual({ error: 'Team leader profile not found' })
    expect(mockSql).toHaveBeenCalled()
  })

  it('refuses agents and plain admins', async () => {
    signedInAs('agent-1', 'agent')
    expect(await resolveTeamLeaderShiftAction('tl-1', '2026-10-12')).toEqual({ error: 'Forbidden' })
    signedInAs('admin-1', 'admin')
    expect(await resolveTeamLeaderShiftAction('tl-1', '2026-10-12')).toEqual({ error: 'Forbidden' })
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('a team leader can resolve their own shift but not another team leader\'s', async () => {
    signedInAs('tl-1', 'admin', true)
    expect(await resolveTeamLeaderShiftAction('tl-2', '2026-10-12')).toEqual({ error: 'Forbidden' })
    expect(mockSql).not.toHaveBeenCalled()
    expect(await resolveTeamLeaderShiftAction('tl-1', '2026-10-12')).toEqual({ error: 'Team leader profile not found' })
    expect(mockSql).toHaveBeenCalled()
  })

  it('management can resolve any team leader\'s shift', async () => {
    signedInAs('mgmt-1', 'management')
    expect(await resolveTeamLeaderShiftAction('tl-2', '2026-10-12')).toEqual({ error: 'Team leader profile not found' })
    expect(mockSql).toHaveBeenCalled()
  })

  it('rejects a malformed date before touching the database', async () => {
    signedInAs('mgmt-1', 'management')
    expect(await resolveTeamLeaderShiftAction('tl-1', 'not-a-date')).toEqual({ error: 'Invalid date.' })
    expect(mockSql).not.toHaveBeenCalled()
  })
})
