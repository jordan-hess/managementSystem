import { NextResponse } from 'next/server'
import { getQuoteOfTheDay } from '@/lib/quotes'

// GET /api/quotes/today — the same quote the Home page shows today.
export async function GET() {
  return NextResponse.json(getQuoteOfTheDay())
}
