import { sql } from '@/lib/db/pool'
import { requireUser } from '@/lib/auth/requireUser'
import { hashPassword } from '@/lib/auth/password'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // requireUser() re-checks is_active, not just at login (2026-09-16
  // production-readiness audit, finding H2/M-follow-up) - proxy.ts's
  // page-level gate doesn't cover /api/* routes, so a deactivated
  // account's still-live JWT could otherwise keep rewriting its own
  // password/email for up to the session's 12h lifetime.
  //
  // Deliberately requireUser(), NOT requireActiveUser() - this route is
  // how a force_password_change caller clears that flag. Gating it on
  // force_password_change would permanently lock such an account out with
  // no way to ever submit the new password it's required to set.
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 })
  const { userId } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { full_name, email, password, clear_force_password_change } = body as {
    full_name?: unknown
    email?: unknown
    password?: unknown
    clear_force_password_change?: unknown
  }

  const updates: Record<string, unknown> = {}
  if (typeof full_name === 'string' && full_name.trim()) updates.full_name = full_name.trim()
  if (typeof email === 'string' && email.trim()) updates.email = email.toLowerCase().trim()
  if (typeof password === 'string' && password.length >= 8) updates.password_hash = await hashPassword(password)

  if (clear_force_password_change) {
    // Only clear the forced-reset flag when this same request actually set a
    // new password - otherwise a caller could clear it while keeping the
    // original/temp credential, defeating the point of a forced reset
    // (2026-09-16 production-readiness audit, finding H1).
    if (!updates.password_hash) {
      return NextResponse.json(
        { error: 'A new password (min. 8 characters) is required to clear the forced password change flag.' },
        { status: 400 }
      )
    }
    updates.force_password_change = false
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  try {
    await sql`
      UPDATE profiles
      SET ${sql(updates)}
      WHERE id = ${userId}
    `
  } catch (error) {
    console.error('profile/update: failed to update profiles', error)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
