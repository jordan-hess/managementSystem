import type { Role } from '@/types'

/**
 * Role picker for the portfolio copy (no login page). Client-safe: no DB
 * import, so components/layout/RoleSwitcher.tsx can use it — see the
 * Sidebar's note on why 'use client' code can't import lib/auth/authz.ts.
 */

export const DEMO_ROLE_COOKIE = 'demo_role'

export interface DemoRoleOption {
  role: Role
  label: string
  description: string
}

export const DEMO_ROLES: DemoRoleOption[] = [
  { role: 'agent', label: 'Agent', description: 'Customers, callbacks, follow-ups and your own queue.' },
  { role: 't3', label: 'T3', description: 'Escalation desk for T2 tickets.' },
  { role: 'qa_analyst', label: 'QA Analyst', description: 'QA reviews, view-only roster, Team Management and Queue Board.' },
  { role: 'team_leader', label: 'Team Leader', description: 'Team Management, Queue Assignment, QA and leadOps.' },
  { role: 'admin', label: 'Admin', description: 'Admin console, user management, escalations and requests.' },
  { role: 'management', label: 'Management', description: 'Org-wide roster, requests, announcements and reporting.' },
  { role: 'hod', label: 'Head of Department', description: 'Everything management sees, plus leadOps oversight.' },
]

export function isDemoRole(value: unknown): value is Role {
  return typeof value === 'string' && DEMO_ROLES.some(r => r.role === value)
}

export function demoRoleLabel(role: Role): string {
  return DEMO_ROLES.find(r => r.role === role)?.label ?? role
}
