import { sql } from '@/lib/db/pool'
import type { ExportReviewItem, ExportReviewRow, ExportRootCause } from './reviewsCsv'

/** Every review whose interaction date falls in [from, to], oldest first, with its items and ticked root causes. */
export async function getReviewsForExport(from: string, to: string): Promise<ExportReviewRow[]> {
  const reviews = await sql<(Omit<ExportReviewRow, 'items' | 'root_causes'> & { id: string })[]>`
    SELECT r.id, COALESCE(rp.full_name, 'Deleted user') AS reviewer_name, r.interaction_date, r.review_date,
      COALESCE(ap.full_name, 'Deleted user') AS agent_name, r.department, r.ticket_reference, r.call_reference,
      c.name AS category_name, r.legs, r.fcr, r.closing_line, rc.name AS legacy_root_cause_name,
      r.gap_identified, r.overall_comments
    FROM qa_reviews r
    LEFT JOIN profiles rp ON rp.id = r.reviewer_id
    LEFT JOIN profiles ap ON ap.id = r.agent_id
    LEFT JOIN qa_query_categories c ON c.id = r.category_id
    LEFT JOIN qa_critical_failure_types rc ON rc.id = r.root_cause_type_id
    WHERE r.interaction_date BETWEEN ${from} AND ${to}
    ORDER BY r.interaction_date ASC, r.created_at ASC
  `
  if (reviews.length === 0) return []
  const ids = reviews.map((r) => r.id)

  const [items, rootCauses] = await Promise.all([
    sql<(ExportReviewItem & { review_id: string })[]>`
      SELECT review_id, item_code, written_value, call_value, comments FROM qa_review_items WHERE review_id = ANY(${ids}::uuid[])
    `,
    // Root causes are the coaching-only types (item_code IS NULL); reason tags are excluded.
    sql<(ExportRootCause & { review_id: string })[]>`
      SELECT rcf.review_id, t.name, rcf.notes
      FROM qa_review_critical_failures rcf
      JOIN qa_critical_failure_types t ON t.id = rcf.critical_failure_type_id
      WHERE rcf.review_id = ANY(${ids}::uuid[]) AND t.item_code IS NULL
      ORDER BY t.sort_order, t.name
    `,
  ])

  const itemsByReview = new Map<string, ExportReviewItem[]>()
  for (const { review_id, ...item } of items) itemsByReview.set(review_id, [...(itemsByReview.get(review_id) ?? []), item])
  const causesByReview = new Map<string, ExportRootCause[]>()
  for (const { review_id, ...cause } of rootCauses) causesByReview.set(review_id, [...(causesByReview.get(review_id) ?? []), cause])

  return reviews.map(({ id, ...r }) => ({ ...r, items: itemsByReview.get(id) ?? [], root_causes: causesByReview.get(id) ?? [] }))
}
