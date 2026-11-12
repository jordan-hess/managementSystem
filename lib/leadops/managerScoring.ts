/**
 * leadOps Manager Scorecard — pure scoring, no I/O.
 *
 * Adapts the Manager roll-up onto the REAL flat TL engine (scoring.ts),
 * not the weighted/1-3-rated model the source spec assumed — see
 * docs/manager-scorecard.md. A Roll-Up Manager KPA's "TL score" is simply
 * aggregateScore() scoped to that KPA's sourceTlKpiKeys (constants.ts's
 * MANAGER_KPAS); a Rated Manager KPA is scored from a manager's own
 * self/reviewer rating, with the reviewer's value — including an explicit
 * N/A — always winning when set.
 *
 * The overall/pillar weighted-sum-with-N/A-redistribution math is the
 * shared lib/shared/weightedScore.ts, reused rather than reimplemented —
 * see that file for the extraction.
 */

import { PILLAR_ORDER } from './constants'
import { EFFICIENCY_METRIC_DEFS } from './constants'
import { aggregateScore, buildScoredKpi } from './scoring'
import { scoreWeighted } from '@/lib/shared/weightedScore'
import type {
  EfficiencyScore,
  ManagerKpa,
  ManagerKpaComputed,
  ManagerKpaRating,
  ManagerRag,
  MockTeamLeader,
  PillarBreakdown,
  RollupTlContribution,
  RollupWeighting,
  TlTeamSize,
} from './types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * This TL's score for a Manager Roll-Up KPA's source KPIs, for one month —
 * aggregateScore() (unchanged, already excludes un-scored KPIs from both
 * numerator and denominator) scoped to just those KPIs. Null when none of
 * them have been scored yet this month, not 0.
 */
export function tlKpaScoreForMonth(
  tlId: string,
  month: string,
  sourceTlKpiKeys: string[],
  scores: EfficiencyScore[],
): number | null {
  const defs = EFFICIENCY_METRIC_DEFS.filter((d) => sourceTlKpiKeys.includes(d.key))
  const kpis = defs.map((def) =>
    buildScoredKpi(def, scores.find((s) => s.tl_id === tlId && s.period === month && s.metric_key === def.key)),
  )
  const { possible, pct } = aggregateScore(kpis)
  return possible === 0 ? null : pct
}

export interface TlInput {
  tlId: string
  tlName: string
  /** 0..100, or null — this TL has nothing scored for this KPA this month. */
  pct: number | null
  teamSize: number | null
}

export interface DeptRollupResult {
  pct: number | null
  contributions: RollupTlContribution[]
  usedEqualWeightFallback: boolean
}

/**
 * The department average for one Roll-Up KPA, across every TL that has a
 * score. A TL with pct===null drops out of BOTH the numerator and the
 * denominator (contributes nothing, doesn't drag the average down) — never
 * treated as a 0. If any CONTRIBUTING TL is missing a team size, the whole
 * KPA falls back to an equal-weight mean rather than silently treating the
 * missing size as 0 (which would understate that TL to nothing).
 */
export function deptRollupScore(tls: TlInput[], weighting: RollupWeighting): DeptRollupResult {
  const contributing = tls.filter((t) => t.pct !== null)

  if (contributing.length === 0) {
    return {
      pct: null,
      contributions: tls.map((t) => ({
        tlId: t.tlId, tlName: t.tlName, pct: t.pct, teamSize: t.teamSize, teamSizeMissing: false, weightShare: null,
      })),
      usedEqualWeightFallback: false,
    }
  }

  const missingTeamSize = contributing.some((t) => !t.teamSize)
  const useEqualWeight = weighting === 'equal' || missingTeamSize

  const pct = useEqualWeight
    ? round2(contributing.reduce((sum, t) => sum + (t.pct as number), 0) / contributing.length)
    : round2(
        contributing.reduce((sum, t) => sum + (t.pct as number) * (t.teamSize as number), 0)
          / contributing.reduce((sum, t) => sum + (t.teamSize as number), 0),
      )

  const totalWeight = useEqualWeight ? contributing.length : contributing.reduce((sum, t) => sum + (t.teamSize as number), 0)

  const contributions: RollupTlContribution[] = tls.map((t) => {
    const isContributing = t.pct !== null
    const weight = useEqualWeight ? 1 : (t.teamSize as number)
    return {
      tlId: t.tlId,
      tlName: t.tlName,
      pct: t.pct,
      teamSize: t.teamSize,
      teamSizeMissing: isContributing && !t.teamSize,
      weightShare: isContributing ? round2((weight / totalWeight) * 100) : null,
    }
  })

  return { pct, contributions, usedEqualWeightFallback: weighting === 'team_size' && missingTeamSize }
}

/**
 * A Rated Manager KPA's score, 0..100. The reviewer's rating wins whenever
 * it's SET — including an explicit 'NA', which overrides a self rating of
 * 3 — falling back to the self rating only when the reviewer hasn't rated
 * yet at all. Null (excluded, not 0) when nothing applicable is available.
 */
export function ratedKpaScorePct(rating: ManagerKpaRating | undefined): number | null {
  const effective = rating?.reviewer_rating ?? rating?.self_rating ?? null
  if (effective === null || effective === 'NA') return null
  return round2((effective / 3) * 100)
}

/**
 * The confirmed row for this TL/month, else the latest PRIOR month's row
 * carried forward with confirmed:false (the pre-fill behaviour the brief
 * asks for), else null — never a real `team_members` query, see
 * docs/manager-scorecard.md on why historical team size can't be derived
 * from the real roster schema.
 */
export function resolveTeamSizeForMonth(tlId: string, month: string, rows: TlTeamSize[]): TlTeamSize | null {
  const exact = rows.find((r) => r.tl_id === tlId && r.month === month)
  if (exact) return exact

  const prior = rows
    .filter((r) => r.tl_id === tlId && r.month < month)
    .sort((a, b) => (a.month < b.month ? 1 : -1))[0]
  if (!prior) return null

  return { tl_id: tlId, month, agent_count: prior.agent_count, confirmed: false }
}

export interface ManagerKpaComputeContext {
  teamLeaders: MockTeamLeader[]
  teamSizes: TlTeamSize[]
  scores: EfficiencyScore[]
  rating?: ManagerKpaRating
  weighting: RollupWeighting
}

/** One Manager KPA's full computed state for a month — Roll-Up (department average) or Rated (self/reviewer). */
export function computeManagerKpa(kpa: ManagerKpa, month: string, ctx: ManagerKpaComputeContext): ManagerKpaComputed {
  if (kpa.method === 'rated') {
    return {
      kpa,
      scorePct: ratedKpaScorePct(ctx.rating),
      contributions: null,
      usedEqualWeightFallback: false,
      rating: ctx.rating,
    }
  }

  const sourceKeys = kpa.sourceTlKpiKeys ?? []
  const tls: TlInput[] = ctx.teamLeaders.map((tl) => ({
    tlId: tl.id,
    tlName: tl.full_name,
    pct: tlKpaScoreForMonth(tl.id, month, sourceKeys, ctx.scores),
    teamSize: resolveTeamSizeForMonth(tl.id, month, ctx.teamSizes)?.agent_count ?? null,
  }))
  const { pct, contributions, usedEqualWeightFallback } = deptRollupScore(tls, ctx.weighting)

  return { kpa, scorePct: pct, contributions, usedEqualWeightFallback }
}

/**
 * The overall weighted score and pillar breakdown — both via the SHARED
 * scoreWeighted (lib/shared/weightedScore.ts), the same N/A-proportional-
 * redistribution math QA's former weighted scoring used. A KPA with no score
 * yet is excluded from both the numerator and the denominator, and the
 * remaining KPAs' weights are implicitly redistributed across the smaller
 * applicable total — exactly "excluding an item's weight from the
 * denominator IS the reweight."
 */
export function overallAndPillars(kpas: ManagerKpaComputed[]): { overallPct: number | null; pillars: PillarBreakdown[] } {
  const toItems = (list: ManagerKpaComputed[]) => list.map((k) => ({
    id: k.kpa.key,
    weight: k.kpa.weight,
    scorePct: k.scorePct === null ? null : k.scorePct / 100,
  }))

  const overall = scoreWeighted(toItems(kpas))

  const pillars: PillarBreakdown[] = PILLAR_ORDER.map((pillar) => {
    const result = scoreWeighted(toItems(kpas.filter((k) => k.kpa.pillar === pillar)))
    return { pillar, pct: result.pct, redistributedWeight: result.totalWeightApplicable }
  })

  return { overallPct: overall.pct, pillars }
}

export function managerRag(overallPct: number | null): ManagerRag {
  if (overallPct === null) return 'no_data'
  if (overallPct >= 85) return 'green'
  if (overallPct >= 70) return 'amber'
  return 'red'
}

/** True while any Rated KPA still lacks a reviewer_rating — the scorecard's "Provisional" vs "Agreed" badge. */
export function isProvisional(kpas: ManagerKpaComputed[]): boolean {
  return kpas.some((k) => k.kpa.method === 'rated' && (!k.rating || k.rating.reviewer_rating === null))
}
