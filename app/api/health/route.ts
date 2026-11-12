import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      environment: process.env.ENVIRONMENT || 'unspecified',
    },
    { status: 200 }
  )
}
