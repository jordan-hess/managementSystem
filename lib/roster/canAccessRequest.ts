import type { RequestStatus, RequestType, Role } from '@/types'

/**
 * Pulled out of app/(app)/roster/actions.ts (a 'use server' module) because
 * Next.js requires every export from a 'use server' file to be an async
 * function - a plain synchronous export like this one builds fine in dev
 * and passes tsc, but fails the production Turbopack/webpack build with
 * "Server Actions must be async functions". Keeping this pure and outside
 * that file also means it can be unit-tested directly, no DB/auth mocking
 * required.
 */
export interface ExistingRequest {
  profile_id: string
  team_id: string | null
  status: RequestStatus
  type: RequestType
  /** The submitter's own role — determines the leader-level visibility rule in canAccessRequest below. */
  requester_role: Role
}

export function canAccessRequest(userId: string, role: Role, req: ExistingRequest): boolean {
  // Split cleanly by who submitted the request (mirrors
  // app/(app)/roster/page.tsx's pendingRequests/myRequests fetches):
  if (req.requester_role === 'team_leader' || req.requester_role === 'admin') {
    // team_leader/admin-authored: Management/HOD only — not even the
    // submitter themselves, and not any other team leader/admin.
    return role === 'management' || role === 'hod'
  }
  // Agent-authored (or any other): the requester themselves, or a
  // team_leader/admin — deliberately NOT Management/HOD, who don't handle
  // agent requests at all (not isTeamLeaderOrAbove, which would include them).
  return req.profile_id === userId || role === 'team_leader' || role === 'admin'
}
