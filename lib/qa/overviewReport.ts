import { DEPARTMENTS, type Department } from '@/lib/departments'

// Pure aggregation for the QA Reviews overview report — no DB import, so the
// client component (and tests) can use these types and helpers directly.
// The queries that feed it live in lib/qa/overviewReportData.ts.

/** One rated review (rating_label <> '') in the overview period. */
export interface OverviewReviewRow {
  id: string
  department: Department
  rating_label: string
  final_score: number | null
  category_id: string | null
  /**
   * The review's root causes, deduped: the ticked root-cause types (coaching-only
   * critical failures) plus the legacy single qa_reviews.root_cause_type_id
   * that reviews saved before the dropdown was removed still carry.
   */
  root_cause_type_ids: string[]
  /** Team leader captured on the review, else the agent's current one. */
  team_leader_name: string | null
}

export interface OverviewRootCauseType {
  id: string
  name: string
  /** Active types are always listed, even at zero, like the reference sheet; a retired one only once it has a count. */
  always_listed: boolean
}

export interface OverviewCategory {
  id: string
  department: Department
  name: string
  /** Same rule as OverviewRootCauseType.always_listed. */
  always_listed: boolean
}

export interface PassRateStats {
  total: number
  passCount: number
  /** 0..100, one decimal; null when there are no rated reviews. */
  passRate: number | null
  /** Mean final score, one decimal; null when no review has a score. */
  averageScore: number | null
}

export interface DepartmentResult extends PassRateStats {
  department: Department
}

export interface TeamLeaderResult extends PassRateStats {
  teamLeader: string
  department: Department
}

export interface RootCauseResult {
  name: string
  counts: Record<Department, number>
  combined: number
}

export interface CategoryResult extends PassRateStats {
  category: string
}

export interface QaOverviewReport {
  departments: DepartmentResult[]
  teamLeaders: TeamLeaderResult[]
  rootCauses: RootCauseResult[]
  categories: Record<Department, CategoryResult[]>
}

export const NO_TEAM_LEADER = 'No team leader'
export const NO_CATEGORY = 'No category'

const isPass = (label: string) => label === 'Good' || label === 'Excellent'
const round1 = (n: number) => Math.round(n * 10) / 10

function toStats(rows: OverviewReviewRow[]): PassRateStats {
  const passCount = rows.filter((r) => isPass(r.rating_label)).length
  const scores = rows.map((r) => r.final_score).filter((s): s is number => s !== null)
  return {
    total: rows.length,
    passCount,
    passRate: rows.length > 0 ? round1((passCount / rows.length) * 100) : null,
    averageScore: scores.length > 0 ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  }
}

function groupBy<K>(rows: OverviewReviewRow[], key: (r: OverviewReviewRow) => K): Map<K, OverviewReviewRow[]> {
  const map = new Map<K, OverviewReviewRow[]>()
  for (const r of rows) {
    const k = key(r)
    const list = map.get(k)
    if (list) list.push(r)
    else map.set(k, [r])
  }
  return map
}

export function buildOverviewReport(
  reviews: OverviewReviewRow[],
  rootCauseTypes: OverviewRootCauseType[],
  categoryList: OverviewCategory[],
  departments: readonly Department[] = DEPARTMENTS,
): QaOverviewReport {
  const byDepartment = groupBy(reviews, (r) => r.department)

  const departmentResults = departments.map((department) => ({ department, ...toStats(byDepartment.get(department) ?? []) }))

  const teamLeaders: TeamLeaderResult[] = []
  for (const department of departments) {
    const byLeader = groupBy(byDepartment.get(department) ?? [], (r) => r.team_leader_name ?? NO_TEAM_LEADER)
    const names = [...byLeader.keys()].sort((a, b) =>
      a === NO_TEAM_LEADER ? 1 : b === NO_TEAM_LEADER ? -1 : a.localeCompare(b))
    for (const teamLeader of names) teamLeaders.push({ teamLeader, department, ...toStats(byLeader.get(teamLeader)!) })
  }

  // Each root cause counts at most once per review; reason tags don't count.
  const countsByType = new Map<string, Record<Department, number>>()
  for (const r of reviews) {
    for (const typeId of new Set(r.root_cause_type_ids)) {
      const counts = countsByType.get(typeId) ?? { Social: 0, T2: 0, Billing: 0 }
      counts[r.department]++
      countsByType.set(typeId, counts)
    }
  }
  const rootCauses = rootCauseTypes
    .filter((t) => t.always_listed || countsByType.has(t.id))
    .map((t) => {
      const counts = countsByType.get(t.id) ?? { Social: 0, T2: 0, Billing: 0 }
      return { name: t.name, counts, combined: departments.reduce((sum, d) => sum + counts[d], 0) }
    })

  // The managed list in its own order, zero-count categories included; reviews without one go last as "No category".
  const categories = { Social: [], T2: [], Billing: [] } as Record<Department, CategoryResult[]>
  for (const department of departments) {
    const byCategory = groupBy(byDepartment.get(department) ?? [], (r) => r.category_id ?? '')
    const listed = categoryList.filter((c) => c.department === department && (c.always_listed || byCategory.has(c.id)))
    categories[department] = listed.map((c) => ({ category: c.name, ...toStats(byCategory.get(c.id) ?? []) }))
    const known = new Set(listed.map((c) => c.id))
    const uncategorised = [...byCategory.entries()].filter(([id]) => !known.has(id)).flatMap(([, rows]) => rows)
    if (uncategorised.length > 0) categories[department].push({ category: NO_CATEGORY, ...toStats(uncategorised) })
  }

  return { departments: departmentResults, teamLeaders, rootCauses, categories }
}
