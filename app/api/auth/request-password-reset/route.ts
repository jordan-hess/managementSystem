import { sql } from '@/lib/db/pool'
import { checkRateLimit } from '@/lib/auth/rateLimit'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { email } = body as { email?: unknown }

  if (typeof email !== 'string') return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })

  // Rate limit applies regardless of whether the account exists, so it can't
  // be used as an account-existence oracle (2026-09-16 production-readiness
  // audit, finding H3).
  const allowed = await checkRateLimit('password-reset-request', email, { maxAttempts: 5, windowMinutes: 60 })
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  // Look up the profile by email
  let profile: { id: string } | null = null
  try {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM profiles WHERE email = ${email.toLowerCase().trim()}
    `
    profile = rows[0] ?? null
  } catch (profileErr) {
    console.error('request-password-reset: error looking up profile by email', profileErr)
  }

  if (!profile) {
    // Return generic success to avoid leaking whether an email exists
    return NextResponse.json({ success: true })
  }

  // Block duplicate pending requests
  const existingRows = await sql<{ id: string }[]>`
    SELECT id FROM password_reset_requests WHERE profile_id = ${profile.id} AND status = ${'pending'}
  `
  const existing = existingRows[0] ?? null

  if (existing) {
    // Previously a distinct 409 here vs. the generic 200 above - a minor
    // account-existence oracle (a "no account" response and an "already
    // pending" response looked different). Log server-side instead and
    // return the same generic response either way (2026-09-16
    // production-readiness audit, finding M5).
    console.error('request-password-reset: duplicate pending request for profile', profile.id)
    return NextResponse.json({ success: true })
  }

  await sql`
    INSERT INTO password_reset_requests (profile_id) VALUES (${profile.id})
  `

  return NextResponse.json({ success: true })
}
