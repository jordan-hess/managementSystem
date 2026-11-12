import { sql } from '@/lib/db/pool'
import { DEPARTMENTS, type Department } from '@/lib/departments'
import { buildOverviewReport, type OverviewCategory, type OverviewReviewRow, type OverviewRootCauseType, type QaOverviewReport } from './overviewReport'

/**
 * Overview report for the QA Reviews page: results by department, by team
 * leader, root causes and query categories. Rated reviews only (rating_label
 * <> ''), same as the headline tiles. The team leader is the one captured on
 * the review at save time (qa_reviews.team_leader_id); only when that is null
 * does it fall back to the agent's current Team Management leader.
 */
export async function getQaOverviewReport(filters: { from: string; to: string; department?: Department }): Promise<QaOverviewReport> {
  const [reviews, rootCauseTypes, categories] = await Promise.all([
    sql<(Omit<OverviewReviewRow, 'final_score'> & { final_score: unknown })[]>`
      SELECT r.id, r.department, r.rating_label, r.final_score, r.category_id,
        ARRAY(
          SELECT rcf.critical_failure_type_id
            FROM qa_review_critical_failures rcf
            JOIN qa_critical_failure_types t ON t.id = rcf.critical_failure_type_id
           WHERE rcf.review_id = r.id AND t.item_code IS NULL
          UNION
          SELECT r.root_cause_type_id WHERE r.root_cause_type_id IS NOT NULL
        ) AS root_cause_type_ids,
        COALESCE(
          (SELECT p.full_name FROM profiles p WHERE p.id = r.team_leader_id),
          (SELECT tlp.full_name
             FROM team_members tm
             JOIN team_leaders tl ON tl.team_id = tm.team_id
             JOIN profiles tlp ON tlp.id = tl.profile_id
            WHERE tm.profile_id = r.agent_id
            LIMIT 1)
        ) AS team_leader_name
      FROM qa_reviews r
      WHERE r.interaction_date BETWEEN ${filters.from} AND ${filters.to}
        AND r.rating_label <> ''
        ${filters.department ? sql`AND r.department = ${filters.department}` : sql``}
    `,
    // Root causes are the coaching-only types (item_code IS NULL); a reason-tag
    // type is only listed when a legacy review's old dropdown value used it.
    sql<OverviewRootCauseType[]>`
      SELECT id, name, (is_active AND item_code IS NULL) AS always_listed FROM qa_critical_failure_types ORDER BY sort_order, name
    `,
    sql<OverviewCategory[]>`
      SELECT id, department, name, is_active AS always_listed FROM qa_query_categories ORDER BY sort_order, lower(name)
    `,
  ])

  return buildOverviewReport(
    // numeric comes back as a string from postgres.js; Number() at the boundary.
    reviews.map((r) => ({ ...r, final_score: r.final_score === null ? null : Number(r.final_score) })),
    rootCauseTypes,
    categories,
    filters.department ? [filters.department] : DEPARTMENTS,
  )
}
