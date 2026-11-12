// Shared agent-department bucketing — pure constants/logic only, no DB
// import, so 'use client' components can import it directly (mirrors the
// existing lib/billing/constants.ts / lib/t2/constants.ts split).
//
// There is no single source of truth for "which department is this agent
// in" in this codebase — profiles.department (free text, historically only
// checked for 'Billing') and profiles.t2_team (free text, set only for
// T2-origin agents) are two independent, unenforced signals. This derives
// one consistent 3-way bucket from them, reusing exactly the logic Roster's
// existing Social/T2 split (lib/roster/teamGroups.ts) already applied,
// extended with the Billing bucket it was missing.

export const DEPARTMENTS = ['Social', 'T2', 'Billing'] as const
export type Department = (typeof DEPARTMENTS)[number]

export interface DepartmentProfile {
  department?: string | null
  t2_team?: string | null
  /**
   * This agent's roster team's department (team_members -> teams.department)
   * — the authoritative signal when known, and REQUIRED for correctly
   * bucketing T2 agents: profiles.t2_team is a narrower legacy field (only
   * set for "T2-origin username-login" migrated accounts) and is empty for
   * the large majority of real T2 team members, who'd otherwise silently
   * fall through to Social. Callers that can join team_members/teams should
   * always populate this; profile.t2_team is only a fallback for agents
   * with no team_members row at all.
   */
  team_department?: string | null
}

/**
 * profiles.department is free text (the Edit Person field), so "Billing " or
 * "billing" must still count — an exact match silently drops the agent into
 * the Social fallback and out of every Billing-only view.
 */
export function isBillingDepartment(department: string | null | undefined): boolean {
  return department?.trim().toLowerCase() === 'billing'
}

export function getAgentDepartment(profile: DepartmentProfile): Department {
  if (isBillingDepartment(profile.department)) return 'Billing'
  if (isDepartment(profile.team_department)) return profile.team_department
  if (profile.t2_team) return 'T2'
  return 'Social'
}

function isDepartment(value: string | null | undefined): value is Department {
  return !!value && (DEPARTMENTS as readonly string[]).includes(value)
}

/** Groups a flat agent list into the 3 department buckets, preserving each bucket's original relative order. */
export function groupAgentsByDepartment<T extends DepartmentProfile>(agents: T[]): Record<Department, T[]> {
  const groups: Record<Department, T[]> = { Social: [], T2: [], Billing: [] }
  for (const agent of agents) groups[getAgentDepartment(agent)].push(agent)
  return groups
}
