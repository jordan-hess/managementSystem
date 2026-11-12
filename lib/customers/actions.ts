'use server'

// Phase 2 (unified Tickets page) — relocated from
// app/(app)/support-tickets/actions.ts, whose route directory is retired
// once /tickets replaces it. Already reused as-is from T2's
// CreateTicketModal.tsx before this move (a "+ New Customer" fallback) —
// that cross-domain reuse is exactly why this belongs in a shared lib/
// location rather than a single route's actions file.

import { sql } from '@/lib/db/pool'
import { requireUser } from '@/lib/auth/requireUser'
import { Customer } from '@/types'
import { isValidPhone, PHONE_FORMAT_ERROR } from './phone'

type ActionResult<T> = { data: T; error?: undefined; field?: undefined } | { data?: undefined; error: string; field?: 'name' | 'phone' | 'email' }

/** Full customer record for the unified Tickets page's CustomerPanel — unrestricted read, matching customers' existing org-wide SELECT rule. */
export async function getCustomerByIdAction(customerId: string): Promise<ActionResult<Customer & { profiles: { full_name: string } | null }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  try {
    const rows = await sql<(Customer & { profiles: { full_name: string } | null })[]>`
      SELECT c.*, jsonb_build_object('full_name', p.full_name) AS profiles
      FROM customers c
      LEFT JOIN profiles p ON p.id = c.created_by
      WHERE c.id = ${customerId}
    `
    const customer = rows[0]
    if (!customer) return { error: 'Customer not found.' }
    return { data: customer }
  } catch (error) {
    console.error('getCustomerByIdAction failed', error)
    return { error: 'Could not load customer.' }
  }
}

/**
 * Email is required and checked case-insensitively against every existing
 * customer before insert — this app had no such check at all before, and
 * live data already shows the result: the same person re-created 4 times
 * under one email within an hour. Only a duplicate on this exact new
 * customer's email blocks creation; it does not touch name/phone matches
 * (a household could plausibly share a phone number, but not an email).
 */
export async function createCustomerAction(name: string, phone: string, email: string): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId } = auth

  if (!isValidPhone(phone)) return { error: PHONE_FORMAT_ERROR, field: 'phone' }

  const trimmedEmail = email.trim()
  if (!trimmedEmail) return { error: 'Email is required.', field: 'email' }

  try {
    const existing = await sql<{ name: string; phone: string }[]>`
      SELECT name, phone FROM customers WHERE email IS NOT NULL AND lower(email) = lower(${trimmedEmail})
    `
    if (existing.length > 0) {
      return { error: `A customer with this email already exists: ${existing[0].name} (${existing[0].phone}). Search for them instead of creating a new record.`, field: 'email' }
    }

    const rows = await sql<{ id: string }[]>`
      INSERT INTO customers (name, phone, email, created_by) VALUES (${name}, ${phone}, ${trimmedEmail}, ${userId}) RETURNING id
    `
    return { data: rows[0] }
  } catch (error) {
    console.error('createCustomerAction failed', error)
    return { error: 'Could not create customer.' }
  }
}
