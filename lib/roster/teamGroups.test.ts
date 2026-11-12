import { buildTeamGroupRoster } from './teamGroups'
import type { Role } from '@/types'

function agent(overrides: Partial<{ id: string; full_name: string; is_active: boolean; role: Role; t2_team: string | null }> = {}) {
  return {
    id: 'agent-1',
    full_name: 'Agent',
    is_active: true,
    role: 'agent' as Role,
    t2_team: null as string | null,
    ...overrides,
  }
}

describe('buildTeamGroupRoster', () => {
  it('excludes a team-less agent from both groups - they should not appear on the roster at all', () => {
    const profiles = [agent({ id: 'a1' })]
    const result = buildTeamGroupRoster(profiles, new Set())
    expect(result.social).toHaveLength(0)
    expect(result.t2).toHaveLength(0)
  })

  it('puts an agent with a team_members row (no t2_team) in social', () => {
    const profiles = [agent({ id: 'a1' })]
    const result = buildTeamGroupRoster(profiles, new Set(['a1']))
    expect(result.social.map(p => p.id)).toEqual(['a1'])
  })

  it('puts a t2_team agent in t2 regardless of team_members membership', () => {
    const profiles = [agent({ id: 'a1', t2_team: 'billing' })]
    const result = buildTeamGroupRoster(profiles, new Set())
    expect(result.t2.map(p => p.id)).toEqual(['a1'])
    expect(result.social).toHaveLength(0)
  })

  it('excludes inactive agents from both groups even if they have a team', () => {
    const profiles = [agent({ id: 'a1', is_active: false })]
    const result = buildTeamGroupRoster(profiles, new Set(['a1']))
    expect(result.social).toHaveLength(0)
  })

  it('excludes non-agent roles', () => {
    const profiles = [agent({ id: 'a1', role: 'team_leader' })]
    const result = buildTeamGroupRoster(profiles, new Set(['a1']))
    expect(result.social).toHaveLength(0)
  })
})
