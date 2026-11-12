/**
 * leadOps Efficiency Scorecard — pure scoring, no I/O.
 *
 * Each KPI is scored 0/1/2 by comparing an Actual against the metric's green
 * and amber thresholds, honouring its direction. The band ordering mirrors
 * the existing SLA chip in components/t2/Badges.tsx: the failing case is
 * resolved first, amber is the near-miss, green is what's left.
 */

import type {
  EfficiencyMetricDef,
  EfficiencyScore,
  ScoreBand,
  ScoredKpi,
} from './types'

/**
 * 2 = meets the green target, 1 = meets amber only, 0 = misses both.
 * Null when nothing has been captured yet, so an un-entered KPI reads as
 * blank rather than as a zero score.
 */
export function scoreKpi(actual: number | null, def: EfficiencyMetricDef): 0 | 1 | 2 | null {
  if (actual === null || Number.isNaN(actual)) return null

  if (def.direction === 'lower_better') {
    if (actual <= def.green) return 2
    if (actual <= def.amber) return 1
    return 0
  }

  if (actual >= def.green) return 2
  if (actual >= def.amber) return 1
  return 0
}

export function scoreBand(score: 0 | 1 | 2 | null): ScoreBand | null {
  if (score === null) return null
  if (score === 2) return 'green'
  if (score === 1) return 'amber'
  return 'red'
}

/**
 * The value a KPI is judged on: the manager's verified figure once it's been
 * verified, otherwise the TL's self-reported one. Null when the KPI is
 * marked N/A — an N/A row has no actual to judge, by definition, regardless
 * of what self_value/verified_value happen to hold.
 */
export function resolveActual(score: EfficiencyScore | undefined): number | null {
  if (!score || score.is_na) return null
  if (score.status === 'verified' && score.verified_value !== null) return score.verified_value
  return score.self_value
}

/**
 * Builds the display/scoring view of one KPI for one period.
 *
 * N/A handling mirrors QA's former weighted-scoring isNa exclusion: an N/A
 * KPI scores null (never 0), and aggregateScore already drops null-scored
 * KPIs from BOTH the achieved sum and the possible denominator — so an N/A
 * KPI is excluded from the aggregate exactly the way an N/A QA criterion's
 * weight is excluded from totalWeightApplicable, not counted as a miss.
 */
export function buildScoredKpi(
  def: EfficiencyMetricDef,
  score: EfficiencyScore | undefined,
): ScoredKpi {
  const isNa = score?.is_na ?? false
  const actual = resolveActual(score)
  const value = isNa ? null : scoreKpi(actual, def)
  return {
    def,
    actual,
    score: value,
    band: scoreBand(value),
    status: score?.status ?? 'self_reported',
    isNa,
    naReason: isNa ? (score?.na_reason ?? null) : null,
  }
}

/** '≥ 60%' / '≤ 10%' — threshold display honouring direction. */
export function formatThreshold(value: number, def: EfficiencyMetricDef): string {
  const comparator = def.direction === 'lower_better' ? '≤' : '≥'
  return `${comparator} ${value}${def.unit}`
}

/**
 * Total across a set of KPIs, as achieved-over-possible. Only scored KPIs
 * count toward the denominator, so an incomplete scorecard isn't dragged
 * down by KPIs nobody has filled in yet.
 */
export function aggregateScore(kpis: ScoredKpi[]): { achieved: number; possible: number; pct: number } {
  const scored = kpis.filter((k) => k.score !== null)
  const achieved = scored.reduce((sum, k) => sum + (k.score as number), 0)
  const possible = scored.length * 2
  return {
    achieved,
    possible,
    pct: possible === 0 ? 0 : Math.round((achieved / possible) * 100),
  }
}
