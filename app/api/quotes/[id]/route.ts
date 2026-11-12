import { NextResponse } from 'next/server'
import { QUOTES } from '@/lib/quotes'

// GET /api/quotes/42
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const quote = QUOTES.find(q => q.id === Number(id))

  if (!quote) {
    return NextResponse.json({ error: 'Quote not found.' }, { status: 404 })
  }

  return NextResponse.json(quote)
}
