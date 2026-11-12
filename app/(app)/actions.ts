'use server'

import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'

/**
 * Self-service profile actions shared across the app shell (currently just
 * AccountModal's "Save Profile" form). Always scoped to the caller's own row
 * via the server-resolved id — never a client-supplied userId — and never
 * touches `role` (that's an admin/management-only concern, handled instead
 * by app/(app)/team-leaders/actions.ts's updatePersonProfile).
 */
export async function updateOwnProfile(fullName: string): Promise<{ success: true } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  const trimmed = fullName.trim()
  if (!trimmed) return { error: 'Full name is required.' }

  try {
    await sql`
      UPDATE profiles SET full_name = ${trimmed}, updated_at = NOW() WHERE id = ${userId}
    `
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update profile.' }
  }
}
