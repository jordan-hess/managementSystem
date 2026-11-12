'use server'

import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { isAdminOrManagement, Role } from '@/lib/auth/authz'
import { CaseCategory } from '@/types'

async function getCurrentUserRole(userId: string): Promise<Role | null> {
  const rows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  return rows[0]?.role ?? null
}

/** case_categories INSERT: role IN ('management','admin'). */
export async function createCaseCategory(name: string): Promise<{ data: CaseCategory } | { error: string; field?: 'name' }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  const role = await getCurrentUserRole(userId)
  if (!role || !isAdminOrManagement(role)) return { error: 'You do not have permission to manage case categories.' }

  try {
    const rows = await sql<CaseCategory[]>`
      INSERT INTO case_categories (name, created_by)
      VALUES (${name}, ${userId})
      RETURNING *
    `
    return { data: rows[0] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create category.'
    return message.includes('duplicate key') ? { error: 'A category with this name already exists.', field: 'name' } : { error: message }
  }
}

/** case_categories UPDATE (rename): role IN ('management','admin'). */
export async function updateCaseCategory(id: string, name: string): Promise<{ data: CaseCategory } | { error: string; field?: 'name' }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  const role = await getCurrentUserRole(userId)
  if (!role || !isAdminOrManagement(role)) return { error: 'You do not have permission to manage case categories.' }

  try {
    const rows = await sql<CaseCategory[]>`
      UPDATE case_categories SET name = ${name}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    if (rows.length === 0) return { error: 'Category not found.' }
    return { data: rows[0] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update category.'
    return message.includes('duplicate key') ? { error: 'A category with this name already exists.', field: 'name' } : { error: message }
  }
}

/** case_categories UPDATE (is_active toggle — no DELETE for this table): role IN ('management','admin'). */
export async function toggleCaseCategoryActive(id: string, isActive: boolean): Promise<{ data: CaseCategory } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  const role = await getCurrentUserRole(userId)
  if (!role || !isAdminOrManagement(role)) return { error: 'You do not have permission to manage case categories.' }

  try {
    const rows = await sql<CaseCategory[]>`
      UPDATE case_categories SET is_active = ${isActive}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    if (rows.length === 0) return { error: 'Category not found.' }
    return { data: rows[0] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update category.' }
  }
}
