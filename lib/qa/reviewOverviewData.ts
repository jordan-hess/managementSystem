import { sql } from '@/lib/db/pool'
import { getBusinessToday, getISOWeekStart, getMonthRange, formatDateKey } from '@/lib/roster/calendarUtils'
import type { Department } from '@/lib/departments'
import { fromDbLeg, itemPasses, type ItemCode } from './scorecard'

export type OverviewPeriod = 'day' | 'week' | 'month'

export interface QaOverviewStats {
  total: number
  passCount: number
  failCount: number
  successRate: number
  flopRate: number
}

/** day = today only; week = ISO Monday..Sunday of this week; month = calendar 1st..last day of this month — all resolved in the business's own timezone. */
export function resolveOverviewPeriod(period: OverviewPeriod): { from: string; to: string } {
  const today = getBusinessToday()

  if (period === 'day') {
    const key = formatDateKey(today)
    return { from: key, to: key }
  }

  if (period === 'week') {
    const monday = getISOWeekStart(today)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { from: formatDateKey(monday), to: formatDateKey(sunday) }
  }

  return getMonthRange(today.getFullYear(), today.getMonth())
}

function toStats(total: number, passCount: number): QaOverviewStats {
  const failCount = total - passCount
  return {
    total,
    passCount,
    failCount,
    successRate: total > 0 ? Math.round((passCount / total) * 100) : 0,
    flopRate: total > 0 ? Math.round((failCount / total) * 100) : 0,
  }
}

/**
 * Headline QA stats for a date range, optionally narrowed by department and by
 * one scorecard item. With no item, pass/fail is review-level: pass =
 * rating_label IN ('Good','Excellent'), fail = 'Fail' / 'Fail (Critical)',
 * unrated ('') reviews excluded. With an item, that item's per-leg values are
 * loaded and judged with itemPasses (single home of the per-leg <= 2 rule);
 * reviews where the item was not scored on either leg are excluded.
 */
export async function getQaReviewOverview(filters: {
  from: string
  to: string
  department?: Department
  itemCode?: ItemCode
}): Promise<QaOverviewStats> {
  const { itemCode } = filters
  if (itemCode) {
    const rows = await sql<{ written_value: string | null; call_value: string | null }[]>`
      SELECT i.written_value, i.call_value
      FROM qa_review_items i
      JOIN qa_reviews r ON r.id = i.review_id
      WHERE r.interaction_date BETWEEN ${filters.from} AND ${filters.to}
        AND i.item_code = ${itemCode}
        ${filters.department ? sql`AND r.department = ${filters.department}` : sql``}
    `
    let total = 0
    let passCount = 0
    for (const row of rows) {
      const passes = itemPasses({ code: itemCode, written: fromDbLeg(itemCode, row.written_value), call: fromDbLeg(itemCode, row.call_value) })
      if (passes === null) continue
      total++
      if (passes) passCount++
    }
    return toStats(total, passCount)
  }

  const [row] = await sql<{ total: string; pass_count: string }[]>`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE r.rating_label IN ('Good', 'Excellent')) AS pass_count
    FROM qa_reviews r
    WHERE r.interaction_date BETWEEN ${filters.from} AND ${filters.to}
      AND r.rating_label <> ''
      ${filters.department ? sql`AND r.department = ${filters.department}` : sql``}
  `
  return toStats(Number(row?.total ?? 0), Number(row?.pass_count ?? 0))
}
