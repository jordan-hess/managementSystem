/**
 * leadOps (Leadership Ops) — Phase 0 prototype types.
 *
 * Row-shaped interfaces here mirror the eventual schema 1:1 (snake_case
 * fields, dates/timestamps as `string`, matching how lib/db/pool.ts keeps
 * Postgres values as strings) so that swapping the mock data in
 * lib/leadops/mockData.ts for real queries is a substitution rather than a
 * rewrite. NOTHING in lib/leadops/ may import lib/db/pool — these types are
 * consumed by 'use client' components, and that module pulls in the
 * `postgres` package (needs Node's net/tls) which can't bundle for the
 * browser. Same reasoning as lib/t2/constants.ts's split from lib/t2/queues.ts.
 *
 * Deliberately NOT in types/index.ts: Phase 0 is an unapproved prototype, so
 * the whole feature stays self-contained under lib/leadops/,
 * components/leadops/ and app/(app)/leadops/ and can be deleted or promoted
 * in one move. Relocate here to types/index.ts when the real tables land.
 *
 * View-model (computed, client-side) types use camelCase, per the existing
 * split in types/index.ts (e.g. ResolvedDaySlot).
 */

// ─── Enums (eventual Postgres enum types) ───────────────────────────────

/** planner_category */
export type PlannerCategory =
  | 'operations'
  | 'coaching'
  | 'qa'
  | 'team_management'
  | 'admin'
  | 'break'
  | 'escalations'

/** block_status */
export type BlockStatus = 'planned' | 'completed' | 'moved' | 'not_completed'

/** verification_status */
export type VerificationStatus = 'self_reported' | 'verified' | 'disputed'

/** efficiency_metric_defs.direction */
export type MetricDirection = 'higher_better' | 'lower_better'

/** performance_reviews.status */
export type ReviewStatus = 'draft' | 'shared' | 'acknowledged'

// ─── Row types (mirror Section 5 of the integration plan) ───────────────

/** shift_templates */
export interface ShiftTemplate {
  id: string
  name: string
  start_time: string // 'HH:MM:SS'
  end_time: string
}

/** shift_template_blocks */
export interface ShiftTemplateBlock {
  id: string
  shift_template_id: string
  sort_order: number
  start_time: string // 'HH:MM:SS'
  end_time: string
  activity: string
  category: PlannerCategory
}

/** tl_shift_days */
export interface TlShiftDay {
  tl_id: string
  date: string // 'YYYY-MM-DD'
  shift_template_id: string
}

/** planner_block_logs */
export interface PlannerBlockLog {
  id: string
  tl_id: string
  date: string
  template_block_id: string
  status: BlockStatus
  /** Null falls back to the template block's planned duration. */
  actual_minutes: number | null
  /**
   * The category the team leader actually recorded for this block. Once
   * settable only for status='moved' (as an override); now settable for
   * 'completed' too, since every block's activity/category is TL-entered
   * rather than fixed — see effectiveCategory in plannerMath.ts. Null falls
   * back to the template block's own category.
   */
  actual_category: PlannerCategory | null
  /**
   * NOT in the agreed Section 5 schema. What the team leader actually did
   * during this block, free text — the canonical template activity name
   * (shift_template_blocks.activity) is shown as a placeholder hint rather
   * than an immutable label, per "the current activities should act as a
   * placeholder". Null/blank falls back to that placeholder for display —
   * see effectiveActivity in plannerMath.ts.
   */
  actual_activity: string | null
  /** Required when status is 'moved' or 'not_completed'. */
  reason: string | null
  updated_at: string
}

/** planner_unplanned_entries */
export interface PlannerUnplannedEntry {
  id: string
  tl_id: string
  date: string
  category: PlannerCategory
  minutes: number
  reason: string
  displaced_block_id: string | null
  created_at: string
}

/**
 * daily_activity_log — NOT in the agreed Section 5 schema. Added for Data
 * Entry's Daily Activity section (calls listened, tickets reviewed, audits
 * completed). Modelled on weekly_manual_log's shape so it can become a real
 * table the same way. coaching_sessions / agent_in_seat / critical_fails
 * are captured here (daily) and rolled up into the weekly view read-only —
 * see lib/leadops/rollups.ts — rather than re-entered on
 * weekly_manual_log, which would mean typing the same figure twice.
 */
export interface DailyActivityLog {
  id: string
  tl_id: string | null
  date: string // 'YYYY-MM-DD'
  calls_listened: number
  tickets_reviewed: number
  audits_completed: number
  critical_fails: number
  coaching_sessions: number
  agent_in_seat: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

/** weekly_manual_log */
export interface WeeklyManualLog {
  tl_id: string
  week_of: string // 'YYYY-MM-DD', the Monday
  calibration: boolean
  re_audits: number
}

/**
 * The Manager weekly log from Section 3.2. NOTE: Section 5's schema has no
 * table for this yet — the shape below is this prototype's proposal, not a
 * mirror of an agreed table. Flagged for review.
 */
export interface ManagerWeeklyLog {
  manager_id: string
  week_of: string
  interactions_sampled: number
  calibration_spot_check: boolean
  tl_one_on_ones: number
}

/**
 * efficiency_metric_defs. `key`, `category`, `kpi`, `direction`, `green` and
 * `amber` are the real columns. The rest are prototype-only display metadata
 * carried from Section 8.3 so the scorecard can be reviewed in full — they'd
 * either become columns or move to a lookup when the table is created.
 */
export interface EfficiencyMetricDef {
  key: string
  /** The KPA this KPI sits under. */
  category: string
  kpi: string
  direction: MetricDirection
  green: number
  amber: number
  /** Display-only: unit suffix for the Actual/threshold columns, e.g. '%'. */
  unit: string
  /** Display-only: where the Actual eventually comes from. */
  source: string
  /** Display-only: measurement cadence. */
  frequency: string
  /** Display-only: true for the carry-over KPIs whose targets aren't re-confirmed. */
  provisional: boolean
  /**
   * Display-only: 'derived' KPIs are computed from the Planner and render
   * read-only; 'manual' KPIs are TL-entered and render as inputs.
   */
  inputMode: 'derived' | 'manual'
  /**
   * Whether this KPI can be marked N/A. Always false for 'derived' KPIs —
   * they're computed from the Planner, so there's nothing to except out of.
   * True for the manual KPIs where 'not applicable this period' is a
   * genuine state, distinct from a value of zero.
   */
  naAllowed: boolean
}

/**
 * efficiency_scores. is_na / na_reason / verification_note are NOT in the
 * agreed Section 5 schema — added for Data Entry's N/A handling (mirrors
 * QA's former weighted-scoring isNa/naReason) and for Management's
 * verification notes (Section 8's 'A manager should be able to ... Add a
 * note/reason'). verified_value is always a CORRECTED ACTUAL, never a
 * score — the score is recomputed from whichever value is current (see
 * scoring.ts's resolveActual/buildScoredKpi). There is no separately
 * editable score field.
 */
export interface EfficiencyScore {
  id: string
  tl_id: string | null
  period: string // 'YYYY-MM-01'
  metric_key: string
  self_value: number | null
  /** True when the TL has marked this KPI not applicable for the period. */
  is_na: boolean
  /** Required when is_na is true. */
  na_reason: string | null
  verified_value: number | null
  status: VerificationStatus
  verified_by: string | null
  verified_at: string | null
  /** Management's note on the verification/correction, if any. */
  verification_note: string | null
  updated_at: string
}

/** kpa_weights */
export interface KpaWeight {
  role: 'tl' | 'manager'
  key: string
  weight: number
  updated_by: string | null
  updated_at: string
}

/**
 * Stand-in for the `profiles` rows the real feature will join to. Phase 0
 * must not query `profiles`, so team leaders are mock records living in
 * lib/leadops/mockData.ts.
 */
export interface MockTeamLeader {
  id: string
  full_name: string
  team: string
}

/** Keys lib/leadops's per-day planner state. Not a DB shape — a lookup key. */
export type PlannerDayKey = string // `${tl_id}|${date}`

export function plannerDayKey(tlId: string, date: string): PlannerDayKey {
  return `${tlId}|${date}`
}

// ─── Manager Scorecard — NOT in the agreed Section 5 schema (new feature) ──
//
// See docs/manager-scorecard.md for the full reasoning. Summary: the source
// spec assumed a weighted, 9-KPA, 1-3-self/reviewer-rated TL engine and real
// persistence, neither of which exist — these types adapt the Manager
// rollup onto the REAL flat 0/1/2 TL engine (scoring.ts/constants.ts) and
// stay Phase 0 mock/in-memory, matching every other leadOps row type here.

export type ManagerKpaPillar = 'impact_delivery' | 'collaboration_leadership' | 'growth_potential'
export type ManagerKpaMethod = 'rollup' | 'rated'
export type ManagerReviewStatus = 'draft' | 'self_submitted' | 'reviewed' | 'locked'
/** 1-3 self/reviewer star rating, or 'NA' — distinct from PlannerCategory-style N/A, since a Rated KPA has no separate is_na boolean: 'NA' IS the value. */
export type RatingValue = 1 | 2 | 3 | 'NA'
export type ManagerRag = 'green' | 'amber' | 'red' | 'no_data'
/** Config toggle so a roll-up can be checked side-by-side against an unweighted Excel figure during rollout. */
export type RollupWeighting = 'team_size' | 'equal'

/**
 * manager_kpas (config/seed, mirrors EfficiencyMetricDef's role). Deliberately
 * keyed by `sourceTlKpiKeys` (a list of the REAL EfficiencyMetricDef.key
 * values that roll up into this Manager KPA) rather than a single
 * KPA-level reference — the only approach that handles both the 5 clean
 * whole-KPA roll-ups and `quality_cx_involvement`'s cross-cutting
 * qa_average_score/csat_cx_score pair uniformly, with no special-casing,
 * while still being a stable key/ID rather than a display-name match.
 */
export interface ManagerKpa {
  key: string
  rank: number
  name: string
  pillar: ManagerKpaPillar
  weight: number
  method: ManagerKpaMethod
  /** Null for a Rated KPA. For a Roll-Up KPA, the EfficiencyMetricDef.key values whose aggregateScore feeds this KPA's department rollup. */
  sourceTlKpiKeys: string[] | null
  /** Display only — the real KPA name shown as "Source" in the UI. Never used in computation, so it can't drift the math. */
  sourceTlKpaLabel: string | null
  whatThisCovers: string
  frequency: string
}

/** manager_monthly_reviews — one per manager per month. */
export interface ManagerMonthlyReview {
  id: string
  manager_id: string | null
  month: string // 'YYYY-MM-01'
  reviewer_id: string | null
  status: ManagerReviewStatus
  /** Set once, on lock — a frozen copy of that month's ManagerScorecardSnapshot, never re-derived afterward even if underlying TL mock data changes later. */
  locked_snapshot: ManagerScorecardSnapshot | null
  created_at: string
  updated_at: string
}

/** manager_kpa_ratings — one row per Rated KPA per manager per month. */
export interface ManagerKpaRating {
  manager_id: string
  month: string
  kpa_key: string
  self_rating: RatingValue | null
  self_evidence: string | null
  /** Wins over self_rating when set — including an explicit 'NA', which still wins over a self rating of 3. */
  reviewer_rating: RatingValue | null
  reviewer_comments: string | null
  agreed_action: string | null
  updated_at: string
}

/**
 * tl_team_sizes — NOT derivable from the real roster schema (team_members
 * has no left_at/history; a departure is a hard DELETE), so this is a new
 * Phase-0-only mock concept, not a real-table mirror like most leadOps
 * types here. Pre-filled from the previous month and `confirmed: false`
 * until explicitly saved for the month being scored.
 */
export interface TlTeamSize {
  tl_id: string
  month: string
  agent_count: number
  confirmed: boolean
}

// ─── View models (computed client-side, camelCase) ──────────────────────

export interface CategoryTotal {
  category: PlannerCategory
  minutes: number
}

/** One line in the "view reasons" expansion. */
export interface PlannerReason {
  kind: 'moved' | 'not_completed' | 'unplanned'
  /** The activity name, or the unplanned entry's category label. */
  label: string
  minutes: number
  reason: string
}

export interface PlannerDaySummary {
  /** The whole rostered day, lunch included — 9h on both templates. */
  plannedMinutes: number
  /** Planned time excluding the Break block — the 8h of actual work. */
  plannedWorkMinutes: number
  /** Planned Break time — the 1h lunch, recorded rather than ignored. */
  plannedBreakMinutes: number
  actualMinutes: number
  actualWorkMinutes: number
  actualBreakMinutes: number
  /** Sums to actualMinutes. */
  categoryTotals: CategoryTotal[]
  /** Moved + unplanned minutes. Overlaps categoryTotals by design. */
  unplannedOrMovedMinutes: number
  reasons: PlannerReason[]
}

export type ScoreBand = 'green' | 'amber' | 'red'

export interface ScoredKpi {
  def: EfficiencyMetricDef
  /** The value being scored — verified_value when verified, else self_value. Null when isNa. */
  actual: number | null
  /** 0 | 1 | 2, or null when no value has been captured yet, or when isNa. */
  score: 0 | 1 | 2 | null
  band: ScoreBand | null
  status: VerificationStatus
  /** True when the TL marked this KPI not applicable — excluded from every aggregate, never treated as zero. */
  isNa: boolean
  naReason: string | null
}

// ─── Manager Scorecard view models (computed client-side, camelCase) ────

/** One TL's contribution to a Roll-Up KPA's department average, for the "View TL breakdown" drawer. */
export interface RollupTlContribution {
  tlId: string
  tlName: string
  /** This TL's score for the KPA's source KPIs this month, 0..100, or null if nothing's scored yet. */
  pct: number | null
  teamSize: number | null
  teamSizeMissing: boolean
  /** This TL's share of the department weight used in the average, 0..100, or null when excluded/equal-weight fallback applies. */
  weightShare: number | null
}

export interface ManagerKpaComputed {
  kpa: ManagerKpa
  /** 0..100, or null — no data (Roll-Up) / not yet rated (Rated). */
  scorePct: number | null
  /** Only set for a Roll-Up KPA. */
  contributions: RollupTlContribution[] | null
  /** True when at least one contributing TL had a missing/zero team size, forcing an equal-weight mean instead of team-size weighting. */
  usedEqualWeightFallback: boolean
  /** Only set for a Rated KPA. */
  rating?: ManagerKpaRating
}

export interface PillarBreakdown {
  pillar: ManagerKpaPillar
  pct: number | null
  redistributedWeight: number
}

export interface ManagerScorecardSnapshot {
  month: string
  managerId: string
  kpas: ManagerKpaComputed[]
  pillars: PillarBreakdown[]
  overallPct: number | null
  rag: ManagerRag
  /** True until every Rated KPA has a reviewer_rating. */
  provisional: boolean
}

/**
 * The manager whose scorecard it is and the reviewer, resolved server-side
 * from LEADOPS_MANAGER_EMAIL / LEADOPS_REVIEWER_EMAIL (see serverGuard.ts) —
 * real profile ids and names, replacing the SIT-only MOCK_MANAGER constants.
 */
export interface LeadOpsPeople {
  managerId: string
  managerName: string
  reviewerId: string
  reviewerName: string
}
