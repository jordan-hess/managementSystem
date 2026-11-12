'use server'

// Phase 2 (unified Tickets page) — relocated from app/(app)/t2/actions.ts,
// where it was the only customer-search function in the app (Social pages
// only ever rendered a <select> from a page-prop-preloaded full customer
// list). Now shared by both the T2 and Social sides of the unified page.
// Extended to also match `phone` (T2's original version only matched
// name/email/IMSI).

import { sql } from '@/lib/db/pool'
import { requireUser } from '@/lib/auth/requireUser'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

export interface CustomerSearchResult { id: string; name: string; phone: string; email: string | null }

export async function searchCustomersAction(query: string): Promise<ActionResult<CustomerSearchResult[]>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  const q = query.trim()
  if (!q) return { data: [] }

  try {
    const rows = await sql<CustomerSearchResult[]>`
      SELECT DISTINCT c.id, c.name, c.phone, c.email
      FROM customers c
      LEFT JOIN tickets t ON t.customer_id = c.id
      WHERE c.name ILIKE ${'%' + q + '%'} OR c.email ILIKE ${'%' + q + '%'}
        OR c.phone ILIKE ${'%' + q + '%'} OR t.imsi ILIKE ${'%' + q + '%'}
      ORDER BY c.name ASC
      LIMIT 20
    `
    return { data: rows }
  } catch (error) {
    console.error('searchCustomersAction failed', error)
    return { error: 'Search failed.' }
  }
}
