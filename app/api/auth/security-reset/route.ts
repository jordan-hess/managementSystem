import { NextResponse } from 'next/server'

// Disabled 2026-09-16 (production-readiness audit, finding C1): this endpoint
// let anyone reset ANY account's password - including admin/hod - using one
// hardcoded answer shared by every profile, with no rate
// limiting. That's a full unauthenticated account-takeover path. Use the
// admin-reviewed flow at /api/auth/request-password-reset instead until a
// real per-user reset mechanism (e.g. emailed OTP) replaces this.
export async function POST() {
  return NextResponse.json(
    { error: 'This reset method has been disabled. Please request an admin reset instead.' },
    { status: 410 }
  )
}
