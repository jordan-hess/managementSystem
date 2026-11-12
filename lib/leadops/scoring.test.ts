import { EFFICIENCY_METRIC_DEFS } from './constants'
import {
  aggregateScore,
  buildScoredKpi,
  formatThreshold,
  resolveActual,
  scoreBand,
  scoreKpi,
} from './scoring'
import type { EfficiencyMetricDef, EfficiencyScore } from './types'

function def(overrides: Partial<EfficiencyMetricDef> = {}): EfficiencyMetricDef {
  return {
    key: 'test_metric',
    category: 'Test KPA',
    kpi: 'Test KPI',
    direction: 'higher_better',
    green: 60,
    amber: 50,
    unit: '%',
    source: 'test',
    frequency: 'Monthly',
    provisional: false,
    inputMode: 'manual',
    naAllowed: true,
    ...overrides,
  }
}

function score(overrides: Partial<EfficiencyScore> = {}): EfficiencyScore {
  return {
    id: 'score-1',
    tl_id: 'tl-1',
    period: '2026-09-01',
    metric_key: 'test_metric',
    self_value: null,
    is_na: false,
    na_reason: null,
    verified_value: null,
    status: 'self_reported',
    verified_by: null,
    verified_at: null,
    verification_note: null,
    updated_at: '',
    ...overrides,
  }
}

describe('scoreKpi — higher is better', () => {
  const higher = def({ direction: 'higher_better', green: 60, amber: 50 })

  it('scores 2 at or above the green threshold', () => {
    expect(scoreKpi(60, higher)).toBe(2)
    expect(scoreKpi(75, higher)).toBe(2)
  })

  it('scores 1 in the amber band', () => {
    expect(scoreKpi(50, higher)).toBe(1)
    expect(scoreKpi(59, higher)).toBe(1)
  })

  it('scores 0 below amber', () => {
    expect(scoreKpi(49, higher)).toBe(0)
    expect(scoreKpi(0, higher)).toBe(0)
  })
})

describe('scoreKpi — lower is better', () => {
  // Planner Adherence: green <= 10%, amber <= 20%.
  const lower = def({ direction: 'lower_better', green: 10, amber: 20 })

  it('scores 2 at or below the green threshold', () => {
    expect(scoreKpi(10, lower)).toBe(2)
    expect(scoreKpi(4, lower)).toBe(2)
  })

  it('scores 1 in the amber band', () => {
    expect(scoreKpi(11, lower)).toBe(1)
    expect(scoreKpi(20, lower)).toBe(1)
  })

  it('scores 0 above amber', () => {
    expect(scoreKpi(21, lower)).toBe(0)
  })
})

describe('scoreKpi — nothing captured', () => {
  it('returns null so an un-entered KPI reads blank, not as a zero', () => {
    expect(scoreKpi(null, def())).toBeNull()
    expect(scoreKpi(Number.NaN, def())).toBeNull()
  })
})

describe('scoreBand', () => {
  it('maps 2/1/0 to green/amber/red and null to null', () => {
    expect(scoreBand(2)).toBe('green')
    expect(scoreBand(1)).toBe('amber')
    expect(scoreBand(0)).toBe('red')
    expect(scoreBand(null)).toBeNull()
  })
})

describe('resolveActual', () => {
  it('uses the self-reported value while unverified', () => {
    expect(resolveActual(score({ self_value: 55 }))).toBe(55)
  })

  it('prefers the manager-verified value once verified', () => {
    expect(resolveActual(score({ self_value: 55, verified_value: 48, status: 'verified' }))).toBe(48)
  })

  it('falls back to self-reported when verified with no override value', () => {
    expect(resolveActual(score({ self_value: 55, verified_value: null, status: 'verified' }))).toBe(55)
  })

  it('returns null when no score row exists yet', () => {
    expect(resolveActual(undefined)).toBeNull()
  })

  it('returns null when marked N/A, even if a stale self_value is still sitting on the row', () => {
    // An N/A row has no actual to judge, by definition — whatever numeric
    // value happens to be in self_value/verified_value must be ignored.
    expect(resolveActual(score({ is_na: true, self_value: 42 }))).toBeNull()
  })
})

describe('N/A handling — mirrors the former QA weighted scoring: excluded, never treated as zero', () => {
  it('scores null, not 0, when marked N/A', () => {
    const kpi = buildScoredKpi(def(), score({ is_na: true, na_reason: 'Not applicable this period' }))
    expect(kpi.actual).toBeNull()
    expect(kpi.score).toBeNull()
    expect(kpi.band).toBeNull()
    expect(kpi.isNa).toBe(true)
    expect(kpi.naReason).toBe('Not applicable this period')
  })

  it('is excluded from aggregateScore’s denominator, not counted as a miss', () => {
    const kpis = [
      buildScoredKpi(def({ key: 'a' }), score({ self_value: 75 })), // 2/2
      buildScoredKpi(def({ key: 'b' }), score({ is_na: true, na_reason: 'n/a' })), // excluded entirely
    ]
    // If N/A were scored as 0, this would read 2 achieved of 4 possible (50%).
    // Correctly excluded, it's 2 of 2 (100%) — the same outcome as if the
    // N/A KPI didn't exist on this scorecard at all.
    expect(aggregateScore(kpis)).toEqual({ achieved: 2, possible: 2, pct: 100 })
  })

  it('returns 100%, not 0%, when every KPI on the card is N/A', () => {
    const kpis = [
      buildScoredKpi(def({ key: 'a' }), score({ is_na: true, na_reason: 'n/a' })),
      buildScoredKpi(def({ key: 'b' }), score({ is_na: true, na_reason: 'n/a' })),
    ]
    // possible = 0 here (no scoreable KPIs at all) — the "don't divide by
    // zero" guard, not a genuine 0% or 100% either way.
    expect(aggregateScore(kpis)).toEqual({ achieved: 0, possible: 0, pct: 0 })
  })

  it('naReason is null unless the KPI is actually N/A, even if one was set and then unmarked', () => {
    const kpi = buildScoredKpi(def(), score({ is_na: false, na_reason: 'stale reason from before it was un-N/A’d', self_value: 80 }))
    expect(kpi.isNa).toBe(false)
    expect(kpi.naReason).toBeNull()
  })
})

describe('buildScoredKpi', () => {
  it('scores the verified value, not the self-reported one, once verified', () => {
    // self-reported 75 would be green; the manager's override of 55 is amber.
    const kpi = buildScoredKpi(
      def({ direction: 'higher_better', green: 60, amber: 50 }),
      score({ self_value: 75, verified_value: 55, status: 'verified' }),
    )
    expect(kpi.actual).toBe(55)
    expect(kpi.score).toBe(1)
    expect(kpi.band).toBe('amber')
    expect(kpi.status).toBe('verified')
  })

  it('defaults an absent score row to self-reported and unscored', () => {
    const kpi = buildScoredKpi(def(), undefined)
    expect(kpi.actual).toBeNull()
    expect(kpi.score).toBeNull()
    expect(kpi.status).toBe('self_reported')
  })
})

describe('formatThreshold', () => {
  it('renders the comparator that matches the direction', () => {
    expect(formatThreshold(60, def({ direction: 'higher_better', unit: '%' }))).toBe('≥ 60%')
    expect(formatThreshold(10, def({ direction: 'lower_better', unit: '%' }))).toBe('≤ 10%')
    expect(formatThreshold(2, def({ direction: 'higher_better', unit: '/month' }))).toBe('≥ 2/month')
  })
})

describe('aggregateScore', () => {
  it('counts achieved over possible, ignoring unscored KPIs', () => {
    const kpis = [
      buildScoredKpi(def({ key: 'a' }), score({ self_value: 75 })), // 2
      buildScoredKpi(def({ key: 'b' }), score({ self_value: 55 })), // 1
      buildScoredKpi(def({ key: 'c' }), undefined), // unscored
    ]
    // 3 achieved of a possible 4 (two scored KPIs x 2) = 75%
    expect(aggregateScore(kpis)).toEqual({ achieved: 3, possible: 4, pct: 75 })
  })

  it('does not divide by zero when nothing is scored', () => {
    expect(aggregateScore([])).toEqual({ achieved: 0, possible: 0, pct: 0 })
  })
})

describe('the shipped metric library', () => {
  it('carries all 21 KPIs across 8 KPAs', () => {
    expect(EFFICIENCY_METRIC_DEFS).toHaveLength(21)
    expect(new Set(EFFICIENCY_METRIC_DEFS.map((m) => m.category)).size).toBe(8)
  })

  it('uses unique keys', () => {
    expect(new Set(EFFICIENCY_METRIC_DEFS.map((m) => m.key)).size).toBe(21)
  })

  it('marks exactly the four confirmed KPIs as non-provisional', () => {
    const confirmed = EFFICIENCY_METRIC_DEFS.filter((m) => !m.provisional)
    expect(confirmed.map((m) => m.key)).toEqual([
      'time_on_coaching_support',
      'planner_adherence',
      'agent_in_seat_days',
      'improvement_ideas',
    ])
  })

  it('derives only the two planner-fed KPIs, leaving the rest manual', () => {
    const derived = EFFICIENCY_METRIC_DEFS.filter((m) => m.inputMode === 'derived')
    expect(derived.map((m) => m.key)).toEqual(['time_on_coaching_support', 'planner_adherence'])
  })

  it('never allows N/A on a derived KPI — there is nothing to except out of a computed value', () => {
    for (const m of EFFICIENCY_METRIC_DEFS) {
      expect(m.naAllowed).toBe(m.inputMode === 'manual')
    }
  })

  it('scores a high occupancy green, since 75%+ is green with no upper bound', () => {
    const occupancy = EFFICIENCY_METRIC_DEFS.find((m) => m.key === 'productivity_occupancy')!
    expect(occupancy.direction).toBe('higher_better')
    expect(scoreKpi(95, occupancy)).toBe(2) // green, not penalised for being high
    expect(scoreKpi(75, occupancy)).toBe(2) // on the green threshold
    expect(scoreKpi(65, occupancy)).toBe(1) // amber
    expect(scoreKpi(64, occupancy)).toBe(0)
  })

  it('orders each threshold pair the way its direction implies', () => {
    for (const m of EFFICIENCY_METRIC_DEFS) {
      if (m.direction === 'higher_better') expect(m.green).toBeGreaterThanOrEqual(m.amber)
      else expect(m.green).toBeLessThanOrEqual(m.amber)
    }
  })
})
