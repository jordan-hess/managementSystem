import { canAccessRequest } from './canAccessRequest'

function agentRequest(overrides: Partial<Parameters<typeof canAccessRequest>[2]> = {}) {
  return {
    profile_id: 'agent-1',
    team_id: 'team-1',
    status: 'pending' as const,
    type: 'leave' as const,
    requester_role: 'agent' as const,
    ...overrides,
  }
}

describe('canAccessRequest — agent-authored requests', () => {
  it('lets the submitting agent access their own request', () => {
    expect(canAccessRequest('agent-1', 'agent', agentRequest())).toBe(true)
  })

  it('blocks a different agent from accessing it', () => {
    expect(canAccessRequest('agent-2', 'agent', agentRequest())).toBe(false)
  })

  it('lets a team_leader access it, regardless of team', () => {
    expect(canAccessRequest('tl-1', 'team_leader', agentRequest())).toBe(true)
  })

  it('lets an admin access it', () => {
    expect(canAccessRequest('admin-1', 'admin', agentRequest())).toBe(true)
  })

  it('blocks management - team leaders own agent requests end to end, per the module comment', () => {
    expect(canAccessRequest('mgmt-1', 'management', agentRequest())).toBe(false)
  })

  it('blocks hod for the same reason', () => {
    expect(canAccessRequest('hod-1', 'hod', agentRequest())).toBe(false)
  })
})

describe('canAccessRequest — team_leader/admin-authored requests', () => {
  it('blocks the submitting team_leader themselves - the whole point of escalating to management', () => {
    const req = agentRequest({ profile_id: 'tl-1', requester_role: 'team_leader' })
    expect(canAccessRequest('tl-1', 'team_leader', req)).toBe(false)
  })

  it('blocks a different, peer team_leader/admin from reviewing it', () => {
    const req = agentRequest({ profile_id: 'tl-1', requester_role: 'team_leader' })
    expect(canAccessRequest('tl-2', 'team_leader', req)).toBe(false)
    expect(canAccessRequest('admin-2', 'admin', req)).toBe(false)
  })

  it('lets management and hod review a team_leader-authored request', () => {
    const req = agentRequest({ profile_id: 'tl-1', requester_role: 'team_leader' })
    expect(canAccessRequest('mgmt-1', 'management', req)).toBe(true)
    expect(canAccessRequest('hod-1', 'hod', req)).toBe(true)
  })

  it('applies the same rule when the submitter is an admin, not just a team_leader', () => {
    const req = agentRequest({ profile_id: 'admin-1', requester_role: 'admin' })
    expect(canAccessRequest('admin-1', 'admin', req)).toBe(false)
    expect(canAccessRequest('mgmt-1', 'management', req)).toBe(true)
  })
})
