import { buildGridSections, groupTeamsByDepartment, type GridTeam } from './gridGroups'

const teams: GridTeam[] = [
  { id: 't2b', name: 'T2 Rotation B', department: 'T2' },
  { id: 'soc', name: 'Social RT', department: 'Social' },
  { id: 'bill', name: 'Billing', department: 'Billing' },
  { id: 'misc', name: 'Misc', department: null },
  { id: 'soc2', name: 'Social LTE', department: 'Social' },
]

describe('groupTeamsByDepartment', () => {
  it('orders departments Social, T2, Billing, Other and sorts teams by name', () => {
    const groups = groupTeamsByDepartment(teams)
    expect(groups.map(g => g.department)).toEqual(['Social', 'T2', 'Billing', 'Other'])
    expect(groups[0].teams.map(t => t.name)).toEqual(['Social LTE', 'Social RT'])
  })
})

describe('buildGridSections', () => {
  const profiles = [{ id: 'z' }, { id: 'a' }, { id: 'b' }, { id: 'c' }]
  const teamIdByProfile = new Map([['z', 'soc'], ['a', 't2b'], ['b', 'soc']])

  it('groups by team, keeps incoming agent order, and trails Unassigned', () => {
    const sections = buildGridSections(profiles, teams, teamIdByProfile, new Set())
    expect(sections.map(s => s.key)).toEqual(['soc', 't2b', 'unassigned'])
    expect(sections[0].agents.map(a => a.id)).toEqual(['z', 'b'])
    expect(sections[2].agents.map(a => a.id)).toEqual(['c'])
  })

  it('restricts to selected teams and hides Unassigned', () => {
    const sections = buildGridSections(profiles, teams, teamIdByProfile, new Set(['t2b']))
    expect(sections.map(s => s.key)).toEqual(['t2b'])
  })
})
