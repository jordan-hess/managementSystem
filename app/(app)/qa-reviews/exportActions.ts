'use server'

import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { isQaReviewer } from '@/lib/auth/authz'
import { getReviewsForExport } from '@/lib/qa/reviewsExportData'
import { reviewsToCsv } from '@/lib/qa/reviewsCsv'
import type { Role } from '@/types'

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** Caps one export so a stray range can't pull years of reviews through the shared pool. */
const MAX_DAYS = 366

/** Per-review CSV for the QA Reviews page's Export button — rows by interaction date, inclusive. */
export async function exportReviewsCsvAction(from: string, to: string): Promise<{ csv: string; count: number } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Unauthorized' }
  const [profile] = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  if (!profile || !isQaReviewer(profile.role)) return { error: 'Forbidden' }

  if (!DATE.test(from) || !DATE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return { error: 'Pick a valid start and end date.' }
  }
  if (from > to) return { error: 'The start date must be on or before the end date.' }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 >= MAX_DAYS) return { error: 'Export at most one year at a time.' }

  try {
    const rows = await getReviewsForExport(from, to)
    return { csv: reviewsToCsv(rows), count: rows.length }
  } catch (error) {
    console.error('exportReviewsCsvAction failed', error)
    return { error: 'Could not export reviews.' }
  }
}
