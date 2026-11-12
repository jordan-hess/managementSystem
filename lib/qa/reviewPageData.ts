import { sql } from '@/lib/db/pool'
import {
  QaSettings, QaCriticalFailureType, QaReview, QaReviewItem, QaReviewCriticalFailure, QaAuditLogEntry,
  QaReviewWithDetail, CoachingAction, QaQueryCategory,
} from '@/types'
import type { Department } from '@/lib/departments'
import { buildReviewOutcome, type ReviewOutcome } from '@/lib/qa/reviewOutcome'
import { loadSettingsRows } from '@/lib/qa/persist'
import { SettingsRow, QaLegs, RatingLabel, applyLegs, type ItemCode } from '@/lib/qa/scorecard'
import { reviewItemsToInputs, byItemOrder } from '@/lib/qa/reviewItems'

// Pure, so it lives in lib/qa/reviewItems.ts (client components use it too); re-exported for server callers.
export { reviewItemsToInputs }

export interface ReviewableAgent {
  id: string
  full_name: string
  /** From Team Management (team_members -> team_leaders) — null if the agent has no team or the team has no leader assigned yet. */
  team_leader_full_name: string | null
  /** Drives the department-grouped agent picker/filter (see lib/departments.ts) — not from Team Management, from profiles directly. */
  department: string | null
  t2_team: string | null
  /** This agent's roster team's department, when known — see lib/departments.ts's DepartmentProfile for why this takes priority over t2_team (profiles.t2_team is empty for most real T2 team members). */
  team_department: string | null
}

export async function getReviewableAgents(): Promise<ReviewableAgent[]> {
  return sql<ReviewableAgent[]>`
    SELECT p.id, p.full_name, tl_profile.full_name AS team_leader_full_name, p.department, p.t2_team,
      (SELECT t.department FROM team_members tm2 JOIN teams t ON t.id = tm2.team_id WHERE tm2.profile_id = p.id LIMIT 1) AS team_department
    FROM profiles p
    LEFT JOIN team_members tm ON tm.profile_id = p.id
    LEFT JOIN team_leaders tl ON tl.team_id = tm.team_id
    LEFT JOIN profiles tl_profile ON tl_profile.id = tl.profile_id
    WHERE p.role = 'agent' AND p.is_active = true
    ORDER BY p.full_name
  `
}

// postgres.js returns `numeric` columns as strings (to avoid float precision
// loss on the wire), unlike int2/int4 which it parses to JS number by
// default. Coerced right at the DB boundary so downstream arithmetic never
// string-concatenates. `null` stays `null`. `date` columns already arrive as
// 'YYYY-MM-DD' strings (see the `types.date` parser in lib/db/pool.ts).
const num = (v: unknown): number => Number(v)
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

export function normalizeSettings<T extends QaSettings>(s: T): T {
  return { ...s, pass_mark: num(s.pass_mark), excellent_from: num(s.excellent_from), critical_fail_cap: num(s.critical_fail_cap) }
}
/** Review-row normalizer: coerces raw_score / final_score (numeric -> string on the wire) to number, null stays null. */
export function normalizeReview<T extends { raw_score?: unknown; final_score?: unknown }>(r: T): Omit<T, 'raw_score' | 'final_score'> & { raw_score: number | null; final_score: number | null } {
  return { ...r, raw_score: numOrNull(r.raw_score), final_score: numOrNull(r.final_score) }
}
export function normalizeReviewItem(i: QaReviewItem): QaReviewItem {
  return { ...i, points_snapshot: num(i.points_snapshot), used: num(i.used), earned: num(i.earned) }
}


export async function getSettingsHistory(): Promise<QaSettings[]> {
  const rows = await sql<QaSettings[]>`
    SELECT s.*, p.full_name AS created_by_name
    FROM qa_settings s
    LEFT JOIN profiles p ON p.id = s.created_by
    ORDER BY s.effective_from DESC, s.created_at DESC
  `
  return rows.map(normalizeSettings)
}

export async function getSettingsRows(): Promise<SettingsRow[]> {
  return loadSettingsRows(sql)
}

/** Reason tags: failure types attached to a specific critical item. */
export async function getReasonTagTypes(): Promise<QaCriticalFailureType[]> {
  return sql<QaCriticalFailureType[]>`
    SELECT * FROM qa_critical_failure_types WHERE item_code IS NOT NULL AND is_active = true ORDER BY item_code, sort_order
  `
}

/** Every "Query / Category" option, inactive included (the form keeps a review's own retired category selectable; settings lists them all). */
export async function getQueryCategories(): Promise<QaQueryCategory[]> {
  return sql<QaQueryCategory[]>`
    SELECT id, department, name, is_active, sort_order FROM qa_query_categories ORDER BY department, sort_order, lower(name)
  `
}

/** Coaching-only flags (no item). Root Cause offers these and the reason-tag types. */
export async function getCoachingFlagTypes(): Promise<QaCriticalFailureType[]> {
  return sql<QaCriticalFailureType[]>`
    SELECT * FROM qa_critical_failure_types WHERE item_code IS NULL AND is_active = true ORDER BY sort_order
  `
}


export async function getReviewWithDetail(id: string): Promise<QaReviewWithDetail | null> {
  const reviews = await sql<(QaReview & { agent_full_name: string; reviewer_full_name: string })[]>`
    SELECT r.*, COALESCE(ag.full_name, 'Deleted user') AS agent_full_name, COALESCE(rv.full_name, 'Deleted user') AS reviewer_full_name
    FROM qa_reviews r
    LEFT JOIN profiles ag ON ag.id = r.agent_id
    LEFT JOIN profiles rv ON rv.id = r.reviewer_id
    WHERE r.id = ${id}
  `
  const row = reviews[0]
  if (!row) return null

  const [rawItems, criticalFailures, auditLog, coachingActionRows] = await Promise.all([
    sql<QaReviewItem[]>`SELECT * FROM qa_review_items WHERE review_id = ${id}`,
    sql<(QaReviewCriticalFailure & { type_name: string; type_item_code: QaCriticalFailureType['item_code'] })[]>`
      SELECT rcf.*, t.name AS type_name, t.item_code AS type_item_code
      FROM qa_review_critical_failures rcf
      JOIN qa_critical_failure_types t ON t.id = rcf.critical_failure_type_id
      WHERE rcf.review_id = ${id}
    `,
    sql<(QaAuditLogEntry & { actor_full_name: string })[]>`
      SELECT al.*, COALESCE(p.full_name, 'Deleted user') AS actor_full_name
      FROM qa_audit_log al
      LEFT JOIN profiles p ON p.id = al.actor_id
      WHERE al.review_id = ${id}
      ORDER BY al.created_at DESC
    `,
    sql<(CoachingAction & { owner_full_name: string; created_by_full_name: string; completed_by_full_name: string | null })[]>`
      SELECT ca.*, COALESCE(o.full_name, 'Deleted user') AS owner_full_name, COALESCE(cb.full_name, 'Deleted user') AS created_by_full_name, cmp.full_name AS completed_by_full_name
      FROM coaching_actions ca
      LEFT JOIN profiles o ON o.id = ca.owner_id
      LEFT JOIN profiles cb ON cb.id = ca.created_by
      LEFT JOIN profiles cmp ON cmp.id = ca.completed_by
      WHERE ca.review_id = ${id}
      ORDER BY ca.created_at DESC
    `,
  ])

  const items = rawItems.map(normalizeReviewItem).sort(byItemOrder)

  const { agent_full_name, reviewer_full_name, ...rest } = row
  const review = normalizeReview(rest)
  return {
    ...review,
    agent: { id: review.agent_id, full_name: agent_full_name },
    reviewer: { id: review.reviewer_id, full_name: reviewer_full_name },
    items,
    criticalFailures: criticalFailures.map(({ type_name, type_item_code, ...cf }) => ({ ...cf, critical_failure_type: { id: cf.critical_failure_type_id, name: type_name, item_code: type_item_code } })),
    auditLog: auditLog.map(({ actor_full_name, ...entry }) => ({ ...entry, actor: { id: entry.actor_id, full_name: actor_full_name } })),
    coachingActions: coachingActionRows.map(({ owner_full_name, created_by_full_name, completed_by_full_name, ...ca }) => ({
      ...ca,
      owner: { id: ca.owner_id, full_name: owner_full_name },
      created_by_profile: { id: ca.created_by, full_name: created_by_full_name },
      completed_by_profile: ca.completed_by && completed_by_full_name ? { id: ca.completed_by, full_name: completed_by_full_name } : undefined,
    })),
  }
}

export interface QaReviewListRow {
  id: string
  agent_id: string | null
  reviewer_id: string | null
  agent_full_name: string
  department: Department
  legs: QaLegs
  interaction_date: string
  final_score: number | null
  rating_label: RatingLabel
  critical_fail: boolean
}

export const REVIEWS_PAGE_SIZE = 10

/** `page` is 1-indexed — page 1 is the first page. */
export async function listReviews(
  filters: { agentId?: string; agentIds?: string[]; department?: Department; from?: string; to?: string; page?: number }
): Promise<{ rows: QaReviewListRow[]; totalCount: number }> {
  const pageIndex = Math.max(1, filters.page ?? 1) - 1
  const whereClause = sql`
    WHERE 1=1
      ${filters.agentId ? sql`AND r.agent_id = ${filters.agentId}` : sql``}
      ${!filters.agentId && filters.agentIds ? sql`AND r.agent_id = ANY(${filters.agentIds})` : sql``}
      ${filters.department ? sql`AND r.department = ${filters.department}` : sql``}
      ${filters.from ? sql`AND r.interaction_date >= ${filters.from}` : sql``}
      ${filters.to ? sql`AND r.interaction_date <= ${filters.to}` : sql``}
  `

  const [rows, countRows] = await Promise.all([
    sql<QaReviewListRow[]>`
      SELECT r.id, r.agent_id, r.reviewer_id, COALESCE(p.full_name, 'Deleted user') AS agent_full_name, r.department, r.legs, r.interaction_date,
             r.final_score, r.rating_label, r.critical_fail
      FROM qa_reviews r
      LEFT JOIN profiles p ON p.id = r.agent_id
      ${whereClause}
      ORDER BY r.interaction_date DESC, r.created_at DESC
      LIMIT ${REVIEWS_PAGE_SIZE} OFFSET ${pageIndex * REVIEWS_PAGE_SIZE}
    `,
    sql<{ count: string }[]>`
      SELECT count(*) FROM qa_reviews r
      ${whereClause}
    `,
  ])

  return { rows: rows.map(normalizeReview), totalCount: Number(countRows[0]?.count ?? 0) }
}

/** Owner candidates for a coaching action — the same role set that can create/edit QA reviews. */
export async function getCoachingOwnerCandidates(): Promise<{ id: string; full_name: string }[]> {
  return sql<{ id: string; full_name: string }[]>`
    SELECT id, full_name FROM profiles
    WHERE role IN ('qa_analyst', 'team_leader', 'admin', 'management', 'hod') AND is_active = true
    ORDER BY full_name
  `
}

export interface MyQaReviewRow {
  id: string
  department: Department
  legs: QaLegs
  interaction_date: string
  final_score: number | null
  rating_label: RatingLabel
  critical_fail: boolean
  agent_feedback: string | null
  reviewer_id: string | null
  reviewer_full_name: string
  /** Pass/fail and a short why — the agent sees this instead of the scorecard. */
  outcome: ReviewOutcome
  /** Ticked root causes (coaching-only critical failures) with their notes. */
  rootCauses: { name: string; notes: string | null }[]
  /** The old single Root Cause dropdown, on reviews saved before it was removed. */
  legacyRootCause: string | null
}

/** An agent's own reviews within one calendar month, for the My QA board (app/(app)/qa/page.tsx). */
export async function getMyReviewsForMonth(agentId: string, monthStart: string, monthEnd: string): Promise<MyQaReviewRow[]> {
  const reviews = await sql<(Omit<MyQaReviewRow, 'outcome' | 'rootCauses' | 'legacyRootCause' | 'final_score'> & {
    final_score: unknown; legacy_root_cause: string | null
    pass_mark: unknown; excellent_from: unknown; critical_fail_cap: unknown
  })[]>`
    SELECT r.id, r.department, r.legs, r.interaction_date, r.final_score, r.rating_label,
           r.critical_fail, r.agent_feedback, r.reviewer_id, COALESCE(rv.full_name, 'Deleted user') AS reviewer_full_name,
           rc.name AS legacy_root_cause, s.pass_mark, s.excellent_from, s.critical_fail_cap
    FROM qa_reviews r
    LEFT JOIN profiles rv ON rv.id = r.reviewer_id
    LEFT JOIN qa_critical_failure_types rc ON rc.id = r.root_cause_type_id
    LEFT JOIN qa_settings s ON s.id = r.settings_id
    WHERE r.agent_id = ${agentId} AND r.interaction_date BETWEEN ${monthStart} AND ${monthEnd}
    ORDER BY r.interaction_date ASC, r.created_at ASC
  `
  if (reviews.length === 0) return []

  const reviewIds = reviews.map((r) => r.id)
  const [itemRows, failureRows] = await Promise.all([
    sql<QaReviewItem[]>`SELECT * FROM qa_review_items WHERE review_id = ANY(${reviewIds})`,
    // Root causes (item_code NULL) and reason tags (item_code set, explain a critical No).
    sql<{ review_id: string; name: string; notes: string | null; item_code: ItemCode | null }[]>`
      SELECT rcf.review_id, t.name, rcf.notes, t.item_code
      FROM qa_review_critical_failures rcf
      JOIN qa_critical_failure_types t ON t.id = rcf.critical_failure_type_id
      WHERE rcf.review_id = ANY(${reviewIds})
      ORDER BY t.sort_order, t.name
    `,
  ])

  return reviews.map(({ legacy_root_cause, pass_mark, excellent_from, critical_fail_cap, ...review }) => {
    const mine = itemRows.filter((i) => i.review_id === review.id).map(normalizeReviewItem)
    const failures = failureRows.filter((f) => f.review_id === review.id)
    const { final_score } = normalizeReview(review)
    return {
      ...review,
      final_score,
      outcome: buildReviewOutcome({
        rating: review.rating_label,
        finalScore: final_score,
        items: applyLegs(reviewItemsToInputs(mine), review.legs),
        reasonTags: failures.flatMap((f) => (f.item_code ? [{ name: f.name, item_code: f.item_code }] : [])),
        // numeric comes back as a string from postgres.js.
        settings: pass_mark === null ? null : { passMark: Number(pass_mark), excellentFrom: Number(excellent_from), criticalFailCap: Number(critical_fail_cap) },
      }),
      rootCauses: failures.filter((f) => f.item_code === null).map((f) => ({ name: f.name, notes: f.notes })),
      legacyRootCause: legacy_root_cause,
    }
  })
}

export interface MyOpenCoachingActionRow {
  id: string
  review_id: string
  category: string
  required_action: string
  due_date: string | null
  status: CoachingAction['status']
}

/** An agent's own open (not completed) coaching actions, for the My QA board's summary column. */
export async function getOpenCoachingActionsForAgent(agentId: string): Promise<MyOpenCoachingActionRow[]> {
  return sql<MyOpenCoachingActionRow[]>`
    SELECT id, review_id, category, required_action, due_date, status
    FROM coaching_actions
    WHERE agent_id = ${agentId} AND status != 'completed'
    ORDER BY due_date ASC NULLS LAST, created_at ASC
  `
}
