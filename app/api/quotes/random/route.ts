import { NextResponse, type NextRequest } from 'next/server'
import { QUOTES } from '@/lib/quotes'

// GET /api/quotes/random?category=perseverance
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category')?.toLowerCase()
  const pool = category ? QUOTES.filter(quote => quote.category === category) : QUOTES

  if (pool.length === 0) {
    return NextResponse.json({ error: 'No quotes found for that category.' }, { status: 404 })
  }

  return NextResponse.json(pool[Math.floor(Math.random() * pool.length)])
}
