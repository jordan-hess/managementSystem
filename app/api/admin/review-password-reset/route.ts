import { sql } from '@/lib/db/pool'
import { requireActiveUser } from '@/lib/auth/requireUser'
import { hashPassword } from '@/lib/auth/password'
import { NextResponse } from 'next/server'
import { randomInt } from 'crypto'

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = 'Tmp@'
  for (let i = 0; i < 8; i++) pw += chars[randomInt(chars.length)]
  return pw
}

export async function POST(request: Request) {
  // requireActiveUser() re-checks is_active and force_password_change, not
  // just at login (2026-09-16 production-readiness audit, finding
  // H2/M-follow-up, extended 2026-09-18 to force_password_change) -
  // consolidated onto the shared helper instead of this route's own
  // profiles query.
  const auth = await requireActiveUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 })
  const { userId, role: reviewerRole } = auth
  // Widened 2026-09-17 to also admit management/hod, who now review
  // requests targeting a privileged account (see the target-scope check
  // below) - agent/team_leader targets stay a team-leader-level concern
  // only (admin/team_leader reviewers), unscoped by team, matching
  // app/(app)/roster/page.tsx's passwordResetRequests fetch.
  if (reviewerRole !== 'admin' && reviewerRole !== 'team_leader' && reviewerRole !== 'management' && reviewerRole !== 'hod') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { request_id, action } = body as { request_id?: unknown; action?: unknown }
  if (typeof request_id !== 'string' || !['approve', 'reject'].includes(action as string)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const resetReqRows = await sql<{ id: string; profile_id: string; status: string }[]>`
    SELECT id, profile_id, status FROM password_reset_requests WHERE id = ${request_id}
  `
  const resetReq = resetReqRows[0] ?? null

  if (!resetReq) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  if (resetReq.status !== 'pending') return NextResponse.json({ error: 'Request is no longer pending.' }, { status: 409 })

  // Which reviewer roles may act depends on who the request TARGETS, not
  // just who the reviewer is (2026-09-16 audit re-check, HIGH finding:
  // password-reset-review privilege escalation - without a target-scope
  // check at all, any team_leader could review a management/admin
  // account's self-service reset and, on approve, receive that account's
  // plaintext temp_password):
  //  - agent/team_leader target: admin or team_leader reviewer (unchanged).
  //  - admin/t3/qa_analyst target: management/hod, or another admin
  //    reviewing as a peer (never themselves - "peer" means someone else).
  //    team_leader is deliberately NOT included here.
  //  - management/hod target: no one, via this endpoint - unchanged, out
  //    of scope for both cases above.
  const targetRows = await sql<{ role: string }[]>`
    SELECT role FROM profiles WHERE id = ${resetReq.profile_id}
  `
  const target = targetRows[0] ?? null
  const targetIsAgentOrTeamLeader = target?.role === 'agent' || target?.role === 'team_leader'
  const targetIsPrivileged = target?.role === 'admin' || target?.role === 't3' || target?.role === 'qa_analyst'

  const allowed =
    (targetIsAgentOrTeamLeader && (reviewerRole === 'admin' || reviewerRole === 'team_leader')) ||
    (targetIsPrivileged && (
      reviewerRole === 'management' ||
      reviewerRole === 'hod' ||
      (reviewerRole === 'admin' && userId !== resetReq.profile_id)
    ))

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (action === 'reject') {
    await sql`
      UPDATE password_reset_requests
      SET status = 'rejected', reviewed_by = ${userId}, reviewed_at = ${new Date().toISOString()}
      WHERE id = ${request_id}
    `
    return NextResponse.json({ success: true })
  }

  const tempPassword = generateTempPassword()
  const password_hash = await hashPassword(tempPassword)

  try {
    await sql`
      UPDATE profiles
      SET password_hash = ${password_hash}, force_password_change = ${true}
      WHERE id = ${resetReq.profile_id}
    `
  } catch (pwErr) {
    console.error('review-password-reset: failed to update profiles.password_hash', pwErr)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }

  await sql`
    UPDATE password_reset_requests
    SET status = 'approved', reviewed_by = ${userId}, reviewed_at = ${new Date().toISOString()}
    WHERE id = ${request_id}
  `

  return NextResponse.json({ success: true, temp_password: tempPassword })
}
