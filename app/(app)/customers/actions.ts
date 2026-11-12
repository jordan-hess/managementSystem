'use server'

import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { Customer, CustomerCallbackHistoryRow, CustomerCaseHistoryRow } from '@/types'
import { isValidPhone, PHONE_FORMAT_ERROR } from '@/lib/customers/phone'

export interface CustomerInput {
  name: string
  phone: string
  email: string
  account_number: string
  notes: string
}

/**
 * customers INSERT: created_by must equal the current user's id — resolved
 * server-side here, never trusted from the client. See lib/auth/authz.ts's
 * header comment / the migration plan for the full authorization rules.
 *
 * Email is required and checked case-insensitively against every existing
 * customer before insert, matching lib/customers/actions.ts's
 * createCustomerAction — the two are the only INSERT INTO customers sites.
 */
export async function createCustomer(
  input: CustomerInput
): Promise<{ data: Customer } | { error: string; field?: 'name' | 'phone' | 'email' }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  if (!isValidPhone(input.phone)) return { error: PHONE_FORMAT_ERROR, field: 'phone' }

  const trimmedEmail = input.email.trim()
  if (!trimmedEmail) return { error: 'Email is required.', field: 'email' }

  try {
    const existing = await sql<{ name: string; phone: string }[]>`
      SELECT name, phone FROM customers WHERE email IS NOT NULL AND lower(email) = lower(${trimmedEmail})
    `
    if (existing.length > 0) {
      return { error: `A customer with this email already exists: ${existing[0].name} (${existing[0].phone}). Search for them instead of creating a new record.`, field: 'email' }
    }

    const rows = await sql<Customer[]>`
      INSERT INTO customers (name, phone, email, account_number, notes, created_by)
      VALUES (
        ${input.name}, ${input.phone}, ${trimmedEmail},
        ${input.account_number || null}, ${input.notes || null}, ${userId}
      )
      RETURNING *
    `
    return { data: rows[0] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create customer.' }
  }
}

/**
 * customers UPDATE: allowed if created_by = current user OR current user's
 * profiles.role = 'admin'. Role is looked up fresh here rather than trusted
 * from a client-supplied prop, so the check can't be bypassed by a stale prop.
 *
 * Email is required and duplicate-checked the same way as createCustomer,
 * excluding this record's own id so re-saving a customer's existing email
 * isn't flagged as a collision with itself.
 */
export async function updateCustomer(
  id: string,
  patch: CustomerInput
): Promise<{ data: Customer } | { error: string; field?: 'name' | 'phone' | 'email' }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  if (!isValidPhone(patch.phone)) return { error: PHONE_FORMAT_ERROR, field: 'phone' }

  const trimmedEmail = patch.email.trim()
  if (!trimmedEmail) return { error: 'Email is required.', field: 'email' }

  const existingRows = await sql<{ created_by: string | null }[]>`
    SELECT created_by FROM customers WHERE id = ${id}
  `
  const existing = existingRows[0]
  if (!existing) return { error: 'Customer not found.' }

  if (existing.created_by !== userId) {
    const profileRows = await sql<{ role: string }[]>`SELECT role FROM profiles WHERE id = ${userId}`
    if (profileRows[0]?.role !== 'admin') {
      return { error: 'You do not have permission to edit this customer.' }
    }
  }

  try {
    const duplicate = await sql<{ name: string; phone: string }[]>`
      SELECT name, phone FROM customers
      WHERE id != ${id} AND email IS NOT NULL AND lower(email) = lower(${trimmedEmail})
    `
    if (duplicate.length > 0) {
      return { error: `A customer with this email already exists: ${duplicate[0].name} (${duplicate[0].phone}).`, field: 'email' }
    }

    const rows = await sql<Customer[]>`
      UPDATE customers
      SET name = ${patch.name}, phone = ${patch.phone}, email = ${trimmedEmail},
          account_number = ${patch.account_number || null}, notes = ${patch.notes || null},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return { data: rows[0] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update customer.' }
  }
}

/**
 * customer_callback_history / customer_case_history reads (CustomerHistoryModal):
 * these are DELIBERATELY unfiltered, org-wide views — see the header comment
 * in Database/migrations/customer-history-views.sql. No per-agent scoping is
 * applied here beyond requiring the caller to be an authenticated user.
 */
export async function getCustomerHistoryAction(
  customerId: string
): Promise<
  | { data: { callbacks: CustomerCallbackHistoryRow[]; cases: CustomerCaseHistoryRow[] } }
  | { error: string }
> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  try {
    const [callbacks, cases] = await Promise.all([
      sql<CustomerCallbackHistoryRow[]>`
        SELECT * FROM customer_callback_history
        WHERE customer_id = ${customerId}
        ORDER BY scheduled_at DESC
      `,
      sql<CustomerCaseHistoryRow[]>`
        SELECT * FROM customer_case_history
        WHERE customer_id = ${customerId}
        ORDER BY created_at DESC
      `,
    ])
    return { data: { callbacks, cases } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load history.' }
  }
}
