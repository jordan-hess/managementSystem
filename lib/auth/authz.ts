import { sql } from '@/lib/db/pool'

/**
 * App-level authorization checks, replacing what RLS + its SQL helper
 * functions used to enforce (Database/schema.sql and Database/migrations/).
 * There is no DB-level enforcement left — every one of these must actually
 * be called by the query code that reads/writes the table, not just exist.
 *
 * Ported directly from the *current, final* SQL definitions (after folding
 * every migration that touched them), not from the original schema files,
 * which are frequently superseded.
 */

export type Role = 'agent' | 'admin' | 'management' | 'team_leader' | 't3' | 'qa_analyst' | 'hod'

export function isAdminOrManagement(role: Role): boolean {
  return role === 'admin' || role === 'management' || role === 'hod'
}

/**
 * team_leader, or anyone isAdminOrManagement already covers — the "can reach
 * Team Management / Queue Assignment, and move/remove a plain team member"
 * tier. isAdminOrManagement remains the correct check for the stricter
 * "can touch a team_leaders row, or edit/deactivate a profile, or manage
 * teams" tier.
 */
export function isTeamLeaderOrAbove(role: Role): boolean {
  return role === 'team_leader' || isAdminOrManagement(role)
}

/**
 * Team Management (/team-leaders) page access — everyone isTeamLeaderOrAbove
 * covers, plus qa_analyst. Page-scoped on purpose: qa_analyst does NOT gain
 * isTeamLeaderOrAbove elsewhere (e.g. Queue Assignment).
 */
export function canAccessTeamManagement(role: Role): boolean {
  return role === 'qa_analyst' || isTeamLeaderOrAbove(role)
}

/**
 * Queue Board (/tickets/queue-assignment) — view and move agents between
 * queues. The team-leader tier plus qa_analyst, page-scoped like
 * canAccessTeamManagement.
 */
export function canManageQueueAssignment(role: Role): boolean {
  return role === 'qa_analyst' || isTeamLeaderOrAbove(role)
}

/**
 * The admin tier on Team Management (leaders, teams, account create/edit/
 * deactivate/delete, any role) — admin/management/hod plus qa_analyst.
 * Excludes Assign Shift, which writes roster_overrides and stays
 * isAdminOrManagement (qa_analyst's roster access is view-only).
 */
export function canAdministerTeamManagement(role: Role): boolean {
  return role === 'qa_analyst' || isAdminOrManagement(role)
}

/**
 * Who sees the org-wide roster grid (every agent's, team leader's and QA
 * analyst's shifts, plus everyone's attendance/overrides). qa_analyst is
 * view-only — writes stay gated by isAdminOrManagement /
 * requireAttendanceWriteAccess in app/(app)/roster/actions.ts.
 */
export function canViewFullRoster(role: Role): boolean {
  return role === 'qa_analyst' || isAdminOrManagement(role)
}

/**
 * Holistic QA Platform (Phase 1) — who can create/view/edit qa_reviews and
 * manage qa_settings. 't3' (T2's escalation-desk role) is deliberately
 * excluded — it's not part of the spec's 5-role QA model
 * (Agent/QA Analyst/Team Leader/Manager/Admin).
 */
export function isQaReviewer(role: Role): boolean {
  return role === 'qa_analyst' || role === 'team_leader' || isAdminOrManagement(role)
}

export function qaReviewCanView(currentUserId: string, currentRole: Role, reviewAgentId: string | null): boolean {
  return reviewAgentId === currentUserId || isQaReviewer(currentRole)
}

export function qaReviewCanCreate(currentRole: Role): boolean {
  return isQaReviewer(currentRole)
}

export function qaReviewCanEdit(currentUserId: string, currentRole: Role, reviewerId: string | null): boolean {
  return reviewerId === currentUserId || isAdminOrManagement(currentRole)
}

/**
 * Author (while still holding a QA reviewer role) or admin/management/hod.
 * Deletion cascades to the review's items, critical failures, audit log and
 * coaching actions (all ON DELETE CASCADE on qa_reviews).
 */
export function qaReviewCanDelete(currentUserId: string, currentRole: Role, reviewerId: string | null): boolean {
  if (isAdminOrManagement(currentRole)) return true
  return reviewerId === currentUserId && isQaReviewer(currentRole)
}

export function qaConfigCanManage(currentRole: Role): boolean {
  return isAdminOrManagement(currentRole)
}

/**
 * Mirrors is_team_leader_for(team_id): does this user lead this team?
 * (Database/team-leaders-schema.sql)
 */
export async function isTeamLeaderFor(userId: string, teamId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM team_leaders WHERE team_id = ${teamId} AND profile_id = ${userId}
  `
  return rows.length > 0
}

/**
 * Mirrors is_submitter_team_leader(p_profile_id): does this profile lead
 * ANY team (distinct from isTeamLeaderFor, which checks a specific team)?
 * (Database/migrations/management-requests-access.sql)
 */
export async function isSubmitterTeamLeader(profileId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM team_leaders WHERE profile_id = ${profileId}
  `
  return rows.length > 0
}

/**
 * Mirrors warnings_select's FINAL policy (qa-coaching-open-access.sql,
 * which superseded the team-leader-scoped version from
 * agent-warnings-visibility.sql): self, any management, or any admin
 * viewing an agent-role target. No team-scoping in the current DB state.
 */
export function warningsCanView(currentUserId: string, currentRole: Role, issuedTo: string, issuedToRole: Role): boolean {
  if (issuedTo === currentUserId) return true
  if (currentRole === 'management' || currentRole === 'hod') return true
  if (currentRole === 'admin' && issuedToRole === 'agent') return true
  return false
}
