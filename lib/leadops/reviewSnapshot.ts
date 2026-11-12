// The frozen figures of a Performance Review (spec section 5). Pure — the server computes it when a review is
// shared and stores the RESULT as jsonb, so a later change to weights or thresholds cannot change an old review.
// Versioned from the start so the one renderer (components/leadops/reviews/ReviewSnapshotView.tsx) can keep
// reading old snapshots after the shape changes. The Manager Scorecard's own locked snapshot is a different,
// manager-level shape and is deliberately not reused or changed.

import { metricsByKpa } from './constants'
import { aggregateScore, buildScoredKpi } from './scoring'
import type { EfficiencyScore, ScoreBand, VerificationStatus } from './types'

export const SNAPSHOT_VERSION = 1

/** The two KPIs derived from the Time & Motion planner: stored as "not tracked" until planner tracking goes live. */
export const PLANNER_DERIVED_KEYS: readonly string[] = ['time_on_coaching_support', 'planner_adherence']

export interface WeeklyFigures {
  weeks: number
  calibrationAttended: number
  coachingSessions: number
  agentInSeatDays: number
  criticalFails: number
  reAudits: number
}

export interface SnapshotKpi {
  key: string
  name: string
  category: string
  unit: string
  direction: 'higher_better' | 'lower_better'
  green: number
  amber: number
  provisional: boolean
  notTracked: boolean
  actual: number | null
  score: 0 | 1 | 2 | null
  band: ScoreBand | null
  status: VerificationStatus
  isNa: boolean
  naReason: string | null
}

export interface ReviewSnapshot {
  version: 1
  takenAt: string
  period: string
  teamLeaderName: string
  sharedByName: string | null
  kpis: SnapshotKpi[]
  overall: { achieved: number; possible: number; pct: number }
  unverifiedCount: number
  weekly: WeeklyFigures
}

export function buildReviewSnapshot(input: {
  period: string
  teamLeaderName: string
  sharedByName: string | null
  takenAt: string
  scores: EfficiencyScore[]
  weekly: WeeklyFigures
}): ReviewSnapshot {
  const scored = metricsByKpa().flatMap(({ metrics }) =>
    metrics.map((def) => {
      const notTracked = PLANNER_DERIVED_KEYS.includes(def.key)
      // A not-tracked KPI is scored from nothing, whatever a stray score row says.
      const row = notTracked ? undefined : input.scores.find((s) => s.metric_key === def.key)
      return { def, notTracked, kpi: buildScoredKpi(def, row) }
    }),
  )

  const kpis: SnapshotKpi[] = scored.map(({ def, notTracked, kpi }) => ({
    key: def.key,
    name: def.kpi,
    category: def.category,
    unit: def.unit,
    direction: def.direction,
    green: def.green,
    amber: def.amber,
    provisional: def.provisional,
    notTracked,
    actual: kpi.actual,
    score: kpi.score,
    band: kpi.band,
    status: kpi.status,
    isNa: kpi.isNa,
    naReason: kpi.naReason,
  }))

  return {
    version: SNAPSHOT_VERSION,
    takenAt: input.takenAt,
    period: input.period,
    teamLeaderName: input.teamLeaderName,
    sharedByName: input.sharedByName,
    kpis,
    overall: aggregateScore(scored.map((s) => s.kpi)),
    unverifiedCount: kpis.filter((k) => k.actual !== null && !k.isNa && k.status !== 'verified').length,
    weekly: input.weekly,
  }
}

export interface FigureChange {
  label: string
  before: string
  after: string
}

const show = (k: SnapshotKpi): string => {
  if (k.notTracked) return "Not tracked"
  if (k.isNa) return "N/A"
  if (k.actual === null) return "—"
  return `${k.actual}${k.unit} · ${k.status === "verified" ? "Verified" : "Unverified"}`
}

const WEEKLY_LABELS: ReadonlyArray<readonly [keyof WeeklyFigures, string]> = [
  ['calibrationAttended', 'Calibration attended'],
  ['coachingSessions', 'Coaching sessions'],
  ['agentInSeatDays', 'Agent-in-seat days'],
  ['criticalFails', 'Critical fails'],
  ['reAudits', 'Re-audits'],
]

/**
 * What changed between the figures frozen at share time and the live ones — for the REVIEWER only ("N figures
 * have changed since you shared this — re-share to update"). The time stamp is never a change. A KPI is reported
 * when its displayed value, N/A state or verification status differs; weekly totals when a total differs.
 */
export function diffSnapshots(frozen: ReviewSnapshot, live: ReviewSnapshot): FigureChange[] {
  const changes: FigureChange[] = []
  for (const before of frozen.kpis) {
    const after = live.kpis.find((k) => k.key === before.key)
    if (!after) continue
    if (show(before) !== show(after)) {
      changes.push({ label: before.name, before: show(before), after: show(after) })
    }
  }
  for (const [key, label] of WEEKLY_LABELS) {
    if (frozen.weekly[key] !== live.weekly[key]) {
      changes.push({ label, before: String(frozen.weekly[key]), after: String(live.weekly[key]) })
    }
  }
  return changes
}
