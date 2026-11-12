import { randomUUID } from 'crypto'
import { sql } from '@/lib/db/pool'
import { hashPassword } from '@/lib/auth/password'
import { requireActiveUser } from '@/lib/auth/requireUser'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // requireActiveUser() re-checks is_active and force_password_change, not
  // just at login (2026-09-16 production-readiness audit, finding
  // H2/M-follow-up, extended 2026-09-18 to force_password_change) -
  // consolidated onto the shared helper instead of this route's own
  // profiles query, which is exactly the kind of duplication that let
  // app/api/roster/month-data/route.ts skip the check entirely.
  const auth = await requireActiveUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 })
  const { role: callerRole } = auth
  // Mirrors canAdministerTeamManagement (lib/auth/authz.ts) — this route backs
  // Team Management's Add Team Member modal, so qa_analyst is included.
  if (callerRole !== 'admin' && callerRole !== 'management' && callerRole !== 'hod' && callerRole !== 'qa_analyst') {
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

  const { email, full_name, role, department } = body as {
    email?: string; full_name?: string; role?: string; department?: string
  }
  if (!email || !full_name || !role) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  if (role !== 'agent' && role !== 'admin' && role !== 'management' && role !== 'hod') {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Invalid email address.', field: 'email' }, { status: 400 })
  }

  // Product decision: every account created here gets a fixed initial
  // password by role, not one the creating admin types in - the account
  // is then required to set its own on first sign-in (via the existing
  // force_password_change -> /change-password flow). Every role this route
  // can create is covered - there's no longer a "custom password" path.
  // Demo values in this local copy.
  const DEFAULT_PASSWORDS: Record<string, string> = {
    agent: 'demo-agent-pass',
    admin: 'demo-staff-pass',
    management: 'demo-staff-pass',
    hod: 'demo-staff-pass',
  }
  const defaultPassword = DEFAULT_PASSWORDS[role]

  const normalizedEmail = email.toLowerCase().trim()
  const existingRows = await sql<{ id: string }[]>`
    SELECT id FROM profiles WHERE email = ${normalizedEmail}
  `
  const existing = existingRows[0] ?? null
  if (existing) return NextResponse.json({ error: 'A user with that email already exists.', field: 'email' }, { status: 409 })

  const password_hash = await hashPassword(defaultPassword)
  const newId = randomUUID()

  // QA analysts work a fixed Mon-Fri 08:00-17:00 week — pattern 'J', the
  // same personal pattern qa-fixed-roster-2026-10.sql gave existing analysts.
  // Without it a new analyst has no schedule and is missing from the roster.
  try {
    await sql`
      INSERT INTO profiles (id, email, full_name, role, department, password_hash, is_active, force_password_change, rotation_pattern_id)
      VALUES (
        ${newId},
        ${normalizedEmail},
        ${full_name},
        ${role},
        ${department?.trim() || null},
        ${password_hash},
        ${true},
        ${true},
        CASE WHEN ${role} = 'qa_analyst' THEN (SELECT id FROM roster_rotation_patterns WHERE code = 'J') END
      )
    `
  } catch (error) {
    console.error('create-user: failed to insert profile', error)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: newId })
}
