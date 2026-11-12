// Pure grouping/filter logic for the admin/management roster grid — agents
// are bucketed under their team (and teams under their department) instead of
// one flat list. No React/DB imports so it stays unit-testable.

import { DEPARTMENTS } from '@/lib/departments'

export const OTHER_DEPARTMENT = 'Other'
export const UNASSIGNED = 'Unassigned'

export interface GridTeam {
  id: string
  name: string
  department: string | null
}

export interface DepartmentTeams {
  department: string
  teams: GridTeam[]
}

export interface GridSection<T> {
  key: string
  department: string
  /** null for the trailing "Unassigned" section (agents with no team). */
  team: GridTeam | null
  agents: T[]
}

function departmentOf(team: GridTeam): string {
  return team.department && (DEPARTMENTS as readonly string[]).includes(team.department)
    ? team.department
    : OTHER_DEPARTMENT
}

const DEPARTMENT_ORDER: string[] = [...DEPARTMENTS, OTHER_DEPARTMENT]

/** Teams bucketed by department (Social, T2, Billing, Other), each bucket sorted by team name; empty departments omitted. */
export function groupTeamsByDepartment(teams: GridTeam[]): DepartmentTeams[] {
  return DEPARTMENT_ORDER
    .map(department => ({
      department,
      teams: teams
        .filter(t => departmentOf(t) === department)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter(g => g.teams.length > 0)
}

/**
 * Sections for the grid body: one per team (department order, then team name),
 * agents inside keep their incoming order. Agents with no team trail in an
 * "Unassigned" section. A non-empty `selectedTeamIds` restricts the output to
 * those teams (and hides Unassigned); empty means no filter.
 */
export function buildGridSections<T extends { id: string }>(
  profiles: T[],
  teams: GridTeam[],
  teamIdByProfile: Map<string, string>,
  selectedTeamIds: Set<string>,
): GridSection<T>[] {
  const filtering = selectedTeamIds.size > 0
  const teamIds = new Set(teams.map(t => t.id))
  const sections: GridSection<T>[] = []

  for (const { department, teams: deptTeams } of groupTeamsByDepartment(teams)) {
    for (const team of deptTeams) {
      if (filtering && !selectedTeamIds.has(team.id)) continue
      const agents = profiles.filter(p => teamIdByProfile.get(p.id) === team.id)
      if (agents.length > 0) sections.push({ key: team.id, department, team, agents })
    }
  }

  if (!filtering) {
    const unassigned = profiles.filter(p => {
      const teamId = teamIdByProfile.get(p.id)
      return !teamId || !teamIds.has(teamId)
    })
    if (unassigned.length > 0) {
      sections.push({ key: 'unassigned', department: UNASSIGNED, team: null, agents: unassigned })
    }
  }

  return sections
}
