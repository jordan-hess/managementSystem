// Server-side gate for every leadOps Server Action. permissions.ts holds the
// workflow rules as pure predicates, but those only drive the UI — a Server
// Action is a public POST endpoint, so each action has to re-check who is
// calling, whether the feature is on, and (via the predicates) what that caller
// may do. Not imported by any client component: it reads process.env and the DB.

import { sql } from '@/lib/db/pool'
import { requireActiveUser } from '@/lib/auth/requireUser'
import { isSubmitterTeamLeader } from '@/lib/auth/authz'
import type { LeadOpsViewerContext } from './permissions'
import type { LeadOpsPeople } from './types'

export interface LeadOpsCaller {
  userId: string
  viewer: LeadOpsViewerContext
}

/**
 * Who is calling. A Server Action is a public POST endpoint, so every leadOps
 * action starts here, whatever the UI hides. Builds the same viewer context the
 * page builds, so the permissions.ts predicates can be reused unchanged on the
 * server.
 */
export async function requireLeadOps(): Promise<LeadOpsCaller | { error: string }> {
  const auth = await requireActiveUser()
  if ('error' in auth) return { error: auth.error }
  const hasTeamRow = await isSubmitterTeamLeader(auth.userId)
  return { userId: auth.userId, viewer: { role: auth.role, hasTeamRow, profileId: auth.userId } }
}

/**
 * The manager whose scorecard this is, and the reviewer, as configured by
 * email (LEADOPS_MANAGER_EMAIL / LEADOPS_REVIEWER_EMAIL). Profile ids differ
 * between environments (PROD profiles use gen_random_uuid()), so ids can't live
 * in code the way the SIT-only mock constants did.
 */
export async function resolveLeadOpsPeople(): Promise<LeadOpsPeople | { error: string }> {
  const managerEmail = process.env.LEADOPS_MANAGER_EMAIL?.trim().toLowerCase()
  const reviewerEmail = process.env.LEADOPS_REVIEWER_EMAIL?.trim().toLowerCase()
  if (!managerEmail || !reviewerEmail) return { error: 'leadOps manager and reviewer are not configured.' }

  const rows = await sql<{ id: string; email: string; full_name: string }[]>`
    SELECT id, lower(email) AS email, full_name FROM profiles
    WHERE is_active = true AND lower(email) = ANY(${[managerEmail, reviewerEmail]}::text[])
  `
  const manager = rows.find((r) => r.email === managerEmail)
  const reviewer = rows.find((r) => r.email === reviewerEmail)
  if (!manager || !reviewer) return { error: 'leadOps manager or reviewer account was not found.' }
  return { managerId: manager.id, managerName: manager.full_name, reviewerId: reviewer.id, reviewerName: reviewer.full_name }
}
