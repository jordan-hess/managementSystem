import type { Sql } from 'postgres'
import type { ItemCode, ScorecardResult, SettingsRow } from '@/lib/qa/scorecard'

/**
 * Non-'use server' helpers shared by the review save actions and the settings
 * re-score action: query the settings rows on any sql/tx handle, and map a
 * ScorecardResult to the values persisted on qa_reviews / qa_review_items.
 */

// postgres.js returns `numeric` columns as strings; Number() at the DB boundary.
export async function loadSettingsRows(db: Sql): Promise<SettingsRow[]> {
  const rows = await db<{ id: string; pass_mark: unknown; excellent_from: unknown; critical_fail_cap: unknown; effective_from: string | Date }[]>`
    SELECT id, pass_mark, excellent_from, critical_fail_cap, effective_from FROM qa_settings
  `
  return rows.map((r) => ({
    id: r.id,
    passMark: Number(r.pass_mark),
    excellentFrom: Number(r.excellent_from),
    criticalFailCap: Number(r.critical_fail_cap),
    effectiveFrom: r.effective_from instanceof Date ? r.effective_from.toISOString().slice(0, 10) : String(r.effective_from).slice(0, 10),
  }))
}

export interface ReviewScoreColumns {
  raw_score: number | null
  final_score: number | null
  critical_fail: boolean
  rating_label: string
  closing_line: string | null
}

export function scoreToReviewColumns(result: ScorecardResult): ReviewScoreColumns {
  return {
    raw_score: result.raw,
    final_score: result.final,
    critical_fail: result.criticalFail,
    rating_label: result.rating,
    closing_line: result.closingLine,
  }
}

/** Per-item used/earned as persisted on qa_review_items. */
export function itemUsedEarned(result: ScorecardResult, code: ItemCode): { used: number; earned: number } {
  const r = result.perItem.find((p) => p.code === code)
  return { used: r?.used ?? 0, earned: r?.earned ?? 0 }
}
