import { NextResponse, type NextRequest } from 'next/server'
import { QUOTES } from '@/lib/quotes'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 250

// GET /api/quotes?category=courage&author=jobs&q=dream&limit=20&offset=0
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const category = params.get('category')?.toLowerCase()
  const author = params.get('author')?.toLowerCase()
  const q = params.get('q')?.toLowerCase()

  const limit = Math.min(Math.max(Number(params.get('limit')) || DEFAULT_LIMIT, 1), MAX_LIMIT)
  const offset = Math.max(Number(params.get('offset')) || 0, 0)

  const filtered = QUOTES.filter(quote =>
    (!category || quote.category === category) &&
    (!author || quote.author.toLowerCase().includes(author)) &&
    (!q || quote.text.toLowerCase().includes(q))
  )

  return NextResponse.json({
    total: filtered.length,
    limit,
    offset,
    data: filtered.slice(offset, offset + limit),
  })
}
