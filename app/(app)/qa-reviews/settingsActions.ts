'use server'

import { revalidatePath } from 'next/cache'
import type { Sql } from 'postgres'
import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { qaConfigCanManage } from '@/lib/auth/authz'
import { loadSettingsRows, scoreToReviewColumns, itemUsedEarned } from '@/lib/qa/persist'
import {
  SCORECARD_ITEMS, applyLegs, fromDbLeg, scoreScorecard,
  type ItemInput, type QaLegs, type SettingsRow,
} from '@/lib/qa/scorecard'
import { DEPARTMENTS, type Department } from '@/lib/departments'
import type { Role } from '@/types'

/**
 * Effective-dated scorecard settings. Saving a row re-scores every review whose
 * interaction_date falls in [effectiveFrom, next row's effective_from) from its
 * stored per-leg values. Failures return { error } (thrown messages are masked in production).
 */

export interface SettingsInput { passMark: number; excellentFrom: number; criticalFailCap: number; effectiveFrom: string }

class ActionError extends Error {}

async function requireManager(): Promise<string> {
  const userId = await getCurrentUserId()
  if (!userId) throw new ActionError('Unauthorized')
  const [profile] = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  if (!profile) throw new ActionError('Unauthorized')
  if (!qaConfigCanManage(profile.role)) throw new ActionError('Forbidden')
  return userId
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function validateDate(effectiveFrom: string): void {
  const d = new Date(`${effectiveFrom}T00:00:00Z`)
  if (!DATE_RE.test(effectiveFrom) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== effectiveFrom) {
    throw new ActionError('Effective-from must be a valid date.')
  }
}

function validate(input: SettingsInput): void {
  const { passMark, excellentFrom, criticalFailCap } = input
  if (![passMark, excellentFrom, criticalFailCap].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new ActionError('Pass mark, Excellent-from and critical-fail cap must be numbers.')
  }
  validateDate(input.effectiveFrom)
  if (!(passMark > 0)) throw new ActionError('Pass mark must be greater than 0.')
  if (!(passMark < excellentFrom)) throw new ActionError('Pass mark must be below Excellent-from.')
  if (!(excellentFrom <= 100)) throw new ActionError('Excellent-from must be 100 or less.')
  if (!(criticalFailCap >= 0 && criticalFailCap <= 100)) throw new ActionError('Critical-fail cap must be between 0 and 100.')
}

/** Earliest effective_from strictly after the given one, or null (window is open-ended). */
function nextEffectiveFrom(rows: SettingsRow[], effectiveFrom: string): string | null {
  let next: string | null = null
  for (const r of rows) {
    if (r.effectiveFrom > effectiveFrom && (next === null || r.effectiveFrom < next)) next = r.effectiveFrom
  }
  return next
}

const round2 = (n: unknown): unknown => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : n)

export async function saveSettingsAction(raw: SettingsInput): Promise<{ rescored: number } | { error: string }> {
  try {
    const userId = await requireManager()
    // Round to numeric(5,2) precision first so validation sees what the DB CHECKs will see.
    const input: SettingsInput = {
      ...raw,
      passMark: round2(raw.passMark) as number,
      excellentFrom: round2(raw.excellentFrom) as number,
      criticalFailCap: round2(raw.criticalFailCap) as number,
    }
    validate(input)

    const rescored = await withTransaction(async (tx) => {
      await tx`LOCK TABLE qa_settings IN SHARE ROW EXCLUSIVE MODE`
      const [saved] = await tx<{ id: string }[]>`
        INSERT INTO qa_settings (pass_mark, excellent_from, critical_fail_cap, effective_from, created_by)
        VALUES (${input.passMark}, ${input.excellentFrom}, ${input.criticalFailCap}, ${input.effectiveFrom}, ${userId})
        ON CONFLICT (effective_from) DO UPDATE SET
          pass_mark = EXCLUDED.pass_mark, excellent_from = EXCLUDED.excellent_from,
          critical_fail_cap = EXCLUDED.critical_fail_cap, created_by = EXCLUDED.created_by, updated_at = now()
        RETURNING id
      `
      const rows = await loadSettingsRows(tx as unknown as Sql)
      const row = rows.find((r) => r.id === saved.id)
      if (!row) throw new ActionError('Failed to save settings.')
      const next = nextEffectiveFrom(rows, row.effectiveFrom)

      const inWindow = await tx<{ id: string; legs: QaLegs; interaction_date: string | Date }[]>`
        SELECT id, legs, interaction_date::text AS interaction_date FROM qa_reviews
        WHERE interaction_date >= ${row.effectiveFrom}::date
          AND (${next}::date IS NULL OR interaction_date < ${next}::date)
      `
      if (inWindow.length === 0) return 0

      const ids = inWindow.map((r) => r.id)
      const itemRows = await tx<{ review_id: string; item_code: string; written_value: string | null; call_value: string | null }[]>`
        SELECT review_id, item_code, written_value, call_value FROM qa_review_items WHERE review_id = ANY(${ids})
      `
      const itemsByReview = new Map<string, { review_id: string; item_code: string; written_value: string | null; call_value: string | null }[]>()
      for (const it of itemRows) {
        const list = itemsByReview.get(it.review_id)
        if (list) list.push(it)
        else itemsByReview.set(it.review_id, [it])
      }

      const rv: { id: string; raw_score: number | null; final_score: number | null; critical_fail: boolean; rating_label: string; closing_line: string | null }[] = []
      const iv: { review_id: string; item_code: string; used: number; earned: number }[] = []

      for (const review of inWindow) {
        const stored = itemsByReview.get(review.id) ?? []
        const inputs: ItemInput[] = applyLegs(
          SCORECARD_ITEMS.map((def) => {
            const s = stored.find((x) => x.item_code === def.code)
            return { code: def.code, written: fromDbLeg(def.code, s?.written_value ?? null), call: fromDbLeg(def.code, s?.call_value ?? null) }
          }),
          review.legs
        )
        const result = scoreScorecard(inputs, row)
        const cols = scoreToReviewColumns(result)
        rv.push({ id: review.id, raw_score: cols.raw_score, final_score: cols.final_score, critical_fail: cols.critical_fail, rating_label: cols.rating_label, closing_line: cols.closing_line })
        for (const def of SCORECARD_ITEMS) {
          const { used, earned } = itemUsedEarned(result, def.code)
          iv.push({ review_id: review.id, item_code: def.code, used, earned })
        }
      }

      await tx`
        UPDATE qa_reviews r SET
          raw_score = v.raw_score, final_score = v.final_score, critical_fail = v.critical_fail,
          rating_label = v.rating_label, closing_line = v.closing_line, settings_id = ${row.id}, updated_at = now()
        FROM jsonb_to_recordset(${JSON.stringify(rv)}::text::jsonb)
          AS v(id uuid, raw_score numeric, final_score numeric, critical_fail boolean, rating_label text, closing_line text)
        WHERE r.id = v.id
      `
      await tx`
        UPDATE qa_review_items i SET used = v.used, earned = v.earned, updated_at = now()
        FROM jsonb_to_recordset(${JSON.stringify(iv)}::text::jsonb)
          AS v(review_id uuid, item_code text, used numeric, earned numeric)
        WHERE i.review_id = v.review_id AND i.item_code = v.item_code
      `
      return inWindow.length
    })

    revalidatePath('/qa-reviews/settings')
    revalidatePath('/qa-reviews')
    return { rescored }
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message }
    console.error('saveSettingsAction failed', error)
    return { error: 'Failed to save settings.' }
  }
}

/** How many reviews a save with this effective-from would re-score (same window as saveSettingsAction). */
export async function countReviewsAffectedBySettings(effectiveFrom: string): Promise<{ count: number } | { error: string }> {
  try {
    await requireManager()
    validateDate(effectiveFrom)
    const rows = await loadSettingsRows(sql)
    const next = nextEffectiveFrom(rows, effectiveFrom)
    const [r] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM qa_reviews
      WHERE interaction_date >= ${effectiveFrom}::date
        AND (${next}::date IS NULL OR interaction_date < ${next}::date)
    `
    return { count: r?.count ?? 0 }
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message }
    console.error('countReviewsAffectedBySettings failed', error)
    return { error: 'Failed to count affected reviews.' }
  }
}

// ─── Query / Category dropdown options (qa_query_categories) ────────────────

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === '23505'

function validateCategoryName(raw: string): string {
  const name = (raw ?? '').trim()
  if (!name) throw new ActionError('Category name is required.')
  if (name.length > 80) throw new ActionError('Category name must be 80 characters or fewer.')
  return name
}

/** Adds a category to the end of its department's list. */
export async function createQueryCategoryAction(input: { department: Department; name: string }): Promise<{ id: string } | { error: string }> {
  try {
    const userId = await requireManager()
    if (!(DEPARTMENTS as readonly string[]).includes(input.department)) throw new ActionError('Invalid department.')
    const name = validateCategoryName(input.name)
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO qa_query_categories (department, name, sort_order, created_by)
      VALUES (${input.department}, ${name},
        (SELECT COALESCE(max(sort_order), 0) + 1 FROM qa_query_categories WHERE department = ${input.department}), ${userId})
      RETURNING id
    `
    revalidatePath('/qa-reviews/settings')
    revalidatePath('/qa-reviews')
    return { id: row.id }
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message }
    if (isUniqueViolation(error)) return { error: 'That category already exists for this department.' }
    console.error('createQueryCategoryAction failed', error)
    return { error: 'Failed to add the category.' }
  }
}

/** Renames and/or (de)activates a category. Deactivating keeps it on existing reviews and in the overview; it just leaves the dropdown. */
export async function updateQueryCategoryAction(input: { id: string; name?: string; isActive?: boolean }): Promise<{ ok: true } | { error: string }> {
  try {
    await requireManager()
    const name = input.name === undefined ? null : validateCategoryName(input.name)
    const isActive = input.isActive === undefined ? null : input.isActive === true
    const rows = await sql`
      UPDATE qa_query_categories SET
        name = COALESCE(${name}, name),
        is_active = COALESCE(${isActive}::boolean, is_active),
        updated_at = now()
      WHERE id = ${input.id}
      RETURNING id
    `
    if (rows.length === 0) throw new ActionError('Category not found.')
    revalidatePath('/qa-reviews/settings')
    revalidatePath('/qa-reviews')
    return { ok: true }
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message }
    if (isUniqueViolation(error)) return { error: 'That category already exists for this department.' }
    console.error('updateQueryCategoryAction failed', error)
    return { error: 'Failed to update the category.' }
  }
}
