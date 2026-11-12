'use server'

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { isSubmitterTeamLeader } from '@/lib/auth/authz'
import type { Role, Warning, WarningType } from '@/types'

// ─── warnings ───────────────────────────────────────────────────────────────
//
// Server actions backing components/warnings/WarningsManager.tsx,
// WarningModal.tsx, and components/layout/NotificationBell.tsx — relocated
// from app/(app)/quality-assurance/actions.ts when that page's warnings
// management moved to app/(app)/qa-reviews/warnings/page.tsx (the old
// point-scored QA system it lived alongside was removed entirely). Every
// rule here mirrors the final DB policies (see lib/auth/authz.ts's
// warningsCanView doc comment for the SELECT side, which isn't exercised
// from this file since the read path for warnings lives in the page's own
// server component).

interface CurrentWarningProfile {
  id: string
  role: Role
}

async function requireCurrentWarningProfile(): Promise<CurrentWarningProfile> {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated.')
  const rows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  const role = rows[0]?.role
  if (!role) throw new Error('Profile not found.')
  return { id: userId, role }
}

/**
 * warnings INSERT rule: issued_by = current user AND (
 *   (current user is management AND is a team leader of ANY team)
 *   OR
 *   (current user is admin AND issued_to !== current user AND target's role = 'agent')
 * )
 */
export async function createWarningAction(input: {
  issuedTo: string
  type: WarningType
  reason: string
  nextSteps: string
}): Promise<Warning> {
  const currentUser = await requireCurrentWarningProfile()

  let allowed = false
  if (currentUser.role === 'management' || currentUser.role === 'hod') {
    allowed = await isSubmitterTeamLeader(currentUser.id)
  } else if (currentUser.role === 'admin' && input.issuedTo !== currentUser.id) {
    const targetRows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${input.issuedTo}`
    allowed = targetRows[0]?.role === 'agent'
  }
  if (!allowed) throw new Error('You are not authorized to issue this warning.')

  const notificationTitle = `You have received a ${input.type} warning`

  const created = await withTransaction(async (tx) => {
    const inserted = await tx<Warning[]>`
      INSERT INTO warnings (issued_to, issued_by, type, reason, next_steps)
      VALUES (${input.issuedTo}, ${currentUser.id}, ${input.type}, ${input.reason}, ${input.nextSteps || null})
      RETURNING *
    `
    // notifications INSERT is unrestricted (any authenticated user may insert
    // for anyone) — no extra check needed beyond already being logged in.
    await tx`
      INSERT INTO notifications (recipient_id, sender_id, title, message, type)
      VALUES (${input.issuedTo}, ${currentUser.id}, ${notificationTitle}, ${input.reason}, ${'warning'})
    `
    return inserted
  })

  return created[0]
}

/** warnings UPDATE rule: issuer-only (issued_by = current user). */
export async function updateWarningAction(
  id: string,
  input: { type: WarningType; reason: string; nextSteps: string },
): Promise<void> {
  const currentUser = await requireCurrentWarningProfile()

  const rows = await sql<{ issued_by: string }[]>`SELECT issued_by FROM warnings WHERE id = ${id}`
  const warning = rows[0]
  if (!warning) throw new Error('Warning not found.')
  if (warning.issued_by !== currentUser.id) throw new Error('You are not authorized to edit this warning.')

  // issued_to is never included here — the DB's prevent_warning_retarget
  // trigger blocks changing it regardless, and the UI never offers to.
  await sql`
    UPDATE warnings SET type = ${input.type}, reason = ${input.reason}, next_steps = ${input.nextSteps || null}
    WHERE id = ${id}
  `
}

/** warnings DELETE rule: issuer-only (issued_by = current user). */
export async function deleteWarningAction(id: string): Promise<void> {
  const currentUser = await requireCurrentWarningProfile()

  const rows = await sql<{ issued_by: string }[]>`SELECT issued_by FROM warnings WHERE id = ${id}`
  const warning = rows[0]
  if (!warning) throw new Error('Warning not found.')
  if (warning.issued_by !== currentUser.id) throw new Error('You are not authorized to delete this warning.')

  await sql`DELETE FROM warnings WHERE id = ${id}`
}
