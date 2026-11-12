'use server'

import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'

/**
 * Server action backing Header.tsx's profile name/email fetch (previously a
 * direct `supabase.from('profiles').select('full_name, email').eq('id',
 * userId).single()` call from the browser). profiles SELECT is unrestricted
 * for authenticated users (Database/schema.sql), but Header only ever
 * displays the caller's own name/email, so this resolves the id from the
 * current session server-side rather than trusting the `userId` prop passed
 * down to the client component.
 */
export async function getHeaderProfileAction(): Promise<{ full_name: string; email: string } | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const rows = await sql<{ full_name: string; email: string }[]>`
    SELECT full_name, email FROM profiles WHERE id = ${userId}
  `
  return rows[0] ?? null
}
