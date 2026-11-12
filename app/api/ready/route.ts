import { NextResponse } from 'next/server'
import { sql } from '@/lib/db/pool'

// Previously identical to /api/health (a static 200 with no DB check) - a
// pod that lost its Postgres connection stayed "Ready" and kept receiving
// traffic instead of being pulled from rotation (2026-09-16
// production-readiness audit, finding H4). /api/health stays a pure
// liveness check; this one actually verifies the dependency it's gating on.
export async function GET() {
  try {
    await sql`SELECT 1`
    return NextResponse.json(
      { status: 'ok', environment: process.env.ENVIRONMENT || 'unspecified' },
      { status: 200 }
    )
  } catch (error) {
    console.error('ready: database check failed', error)
    return NextResponse.json(
      { status: 'error', environment: process.env.ENVIRONMENT || 'unspecified' },
      { status: 503 }
    )
  }
}
