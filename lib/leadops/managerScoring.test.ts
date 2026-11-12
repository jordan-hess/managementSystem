import {
  computeManagerKpa,
  deptRollupScore,
  isProvisional,
  managerRag,
  overallAndPillars,
  ratedKpaScorePct,
  resolveTeamSizeForMonth,
  tlKpaScoreForMonth,
  type ManagerKpaComputeContext,
  type TlInput,
} from './managerScoring'
import { MANAGER_KPAS } from './constants'
import type {
  EfficiencyScore, ManagerKpa, ManagerKpaComputed, ManagerKpaRating, MockTeamLeader, TlTeamSize,
} from './types'

function score(tlId: string, metricKey: string, selfValue: number | null, overrides: Partial<EfficiencyScore> = {}): EfficiencyScore {
  return {
    id: `${tlId}-${metricKey}`,
    tl_id: tlId,
    period: '2026-09-01',
    metric_key: metricKey,
    self_value: selfValue,
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

describe('tlKpaScoreForMonth', () => {
  // team_sla_adherence (green 90, lower bound irrelevant) -> 2; backlog_aging
  // (lower_better, green 5, amber 10) with actual 12 -> 0. Average of 2 and 0
  // over 2 points possible each = 2/4 = 50%.
  const scores = [
    score('tl-1', 'team_sla_adherence', 95),
    score('tl-1', 'backlog_aging', 12),
  ]

  it('derives a %, from real per-KPI 0/1/2 scores, scoped to the given keys', () => {
    expect(tlKpaScoreForMonth('tl-1', '2026-09-01', ['team_sla_adherence', 'backlog_aging'], scores)).toBe(50)
  })

  it('returns null, not 0, when none of the keys have been scored yet', () => {
    expect(tlKpaScoreForMonth('tl-1', '2026-09-01', ['team_sla_adherence'], [])).toBeNull()
  })

  it('ignores a different TL\'s or a different month\'s scores', () => {
    expect(tlKpaScoreForMonth('tl-2', '2026-09-01', ['team_sla_adherence', 'backlog_aging'], scores)).toBeNull()
    expect(tlKpaScoreForMonth('tl-1', '2026-08-01', ['team_sla_adherence', 'backlog_aging'], scores)).toBeNull()
  })
})

describe('deptRollupScore', () => {
  // The source spec's own fixtures (Test A: equal weight; Test B: team-size
  // weighted) — fed directly as TlInput.pct, since that's the layer these
  // fixtures actually exercise (the real engine derives pct from per-KPI
  // scores separately, covered above).
  const TEAM_PERF: TlInput[] = [
    { tlId: 'tl1', tlName: 'TL 1', pct: 92, teamSize: 12 },
    { tlId: 'tl2', tlName: 'TL 2', pct: 85, teamSize: 10 },
    { tlId: 'tl3', tlName: 'TL 3', pct: 78, teamSize: 8 },
    { tlId: 'tl4', tlName: 'TL 4', pct: 90, teamSize: 14 },
    { tlId: 'tl5', tlName: 'TL 5', pct: 95, teamSize: 6 },
  ]
  const COACHING: TlInput[] = [
    { tlId: 'tl1', tlName: 'TL 1', pct: 88, teamSize: 12 },
    { tlId: 'tl2', tlName: 'TL 2', pct: 93, teamSize: 10 },
    { tlId: 'tl3', tlName: 'TL 3', pct: 80, teamSize: 8 },
    { tlId: 'tl4', tlName: 'TL 4', pct: 86, teamSize: 14 },
    { tlId: 'tl5', tlName: 'TL 5', pct: 91, teamSize: 6 },
  ]

  it('Test A — equal weighting matches the Excel-parity fixture', () => {
    expect(deptRollupScore(TEAM_PERF, 'equal').pct).toBe(88)
    expect(deptRollupScore(COACHING, 'equal').pct).toBe(87.6)
  })

  it('Test B — team-size weighting matches the fixture', () => {
    expect(deptRollupScore(TEAM_PERF, 'team_size').pct).toBe(88.16)
    expect(deptRollupScore(COACHING, 'team_size').pct).toBe(87.52)
  })

  it('excludes a TL with no score from the average, not as a 0', () => {
    const withGap: TlInput[] = [
      { tlId: 'tl1', tlName: 'TL 1', pct: 90, teamSize: 10 },
      { tlId: 'tl2', tlName: 'TL 2', pct: null, teamSize: 10 },
    ]
    const result = deptRollupScore(withGap, 'team_size')
    expect(result.pct).toBe(90)
    expect(result.contributions.find((c) => c.tlId === 'tl2')?.weightShare).toBeNull()
  })

  it('returns null, not 0, when no TL has a score', () => {
    const empty: TlInput[] = [{ tlId: 'tl1', tlName: 'TL 1', pct: null, teamSize: 10 }]
    expect(deptRollupScore(empty, 'team_size').pct).toBeNull()
  })

  it('falls back to an equal-weight mean when a contributing TL has no team size, and flags it', () => {
    const missingSize: TlInput[] = [
      { tlId: 'tl1', tlName: 'TL 1', pct: 90, teamSize: 10 },
      { tlId: 'tl2', tlName: 'TL 2', pct: 80, teamSize: null },
    ]
    const result = deptRollupScore(missingSize, 'team_size')
    expect(result.pct).toBe(85) // plain mean of 90 and 80, not weighted
    expect(result.usedEqualWeightFallback).toBe(true)
  })

  it('does not flag the fallback when the config itself is "equal" by choice', () => {
    const result = deptRollupScore(TEAM_PERF, 'equal')
    expect(result.usedEqualWeightFallback).toBe(false)
  })
})

describe('ratedKpaScorePct', () => {
  it('scores a plain self rating when there is no reviewer rating yet', () => {
    expect(ratedKpaScorePct({ manager_id: 'm', month: '2026-09-01', kpa_key: 'k', self_rating: 3, self_evidence: null, reviewer_rating: null, reviewer_comments: null, agreed_action: null, updated_at: '' })).toBe(100)
  })

  it('the reviewer rating wins over a different self rating', () => {
    expect(ratedKpaScorePct({ manager_id: 'm', month: '2026-09-01', kpa_key: 'k', self_rating: 1, self_evidence: null, reviewer_rating: 3, reviewer_comments: null, agreed_action: null, updated_at: '' })).toBe(100)
  })

  it('an explicit reviewer N/A overrides a self rating of 3 (the precedence rule)', () => {
    expect(ratedKpaScorePct({ manager_id: 'm', month: '2026-09-01', kpa_key: 'k', self_rating: 3, self_evidence: null, reviewer_rating: 'NA', reviewer_comments: null, agreed_action: null, updated_at: '' })).toBeNull()
  })

  it('returns null, not 0, when nothing has been rated at all', () => {
    expect(ratedKpaScorePct(undefined)).toBeNull()
  })
})

describe('resolveTeamSizeForMonth', () => {
  const rows: TlTeamSize[] = [
    { tl_id: 'tl1', month: '2026-07-01', agent_count: 9, confirmed: true },
    { tl_id: 'tl1', month: '2026-08-01', agent_count: 10, confirmed: true },
  ]

  it('returns the exact-month row when one exists', () => {
    expect(resolveTeamSizeForMonth('tl1', '2026-08-01', rows)).toEqual(rows[1])
  })

  it('carries forward the latest PRIOR month, marked unconfirmed', () => {
    expect(resolveTeamSizeForMonth('tl1', '2026-09-01', rows)).toEqual({ tl_id: 'tl1', month: '2026-09-01', agent_count: 10, confirmed: false })
  })

  it('returns null when there is no row for this TL at all', () => {
    expect(resolveTeamSizeForMonth('tl2', '2026-09-01', rows)).toBeNull()
  })
})

describe('managerRag', () => {
  it('bands the RAG boundaries exactly as specified', () => {
    expect(managerRag(0.85 * 100)).toBe('green')
    expect(managerRag(84.99)).toBe('amber')
    expect(managerRag(70)).toBe('amber')
    expect(managerRag(69.99)).toBe('red')
    expect(managerRag(null)).toBe('no_data')
  })
})

describe('computeManagerKpa / overallAndPillars / isProvisional', () => {
  const teamLeaders: MockTeamLeader[] = [
    { id: 'tl1', full_name: 'TL One', team: 'A' },
    { id: 'tl2', full_name: 'TL Two', team: 'B' },
  ]
  const teamSizes: TlTeamSize[] = [
    { tl_id: 'tl1', month: '2026-09-01', agent_count: 10, confirmed: true },
    { tl_id: 'tl2', month: '2026-09-01', agent_count: 10, confirmed: true },
  ]

  const rollupKpa: ManagerKpa = {
    key: 'test_rollup', rank: 1, name: 'Test Roll-Up', pillar: 'impact_delivery', weight: 60, method: 'rollup',
    sourceTlKpiKeys: ['team_sla_adherence'], sourceTlKpaLabel: null, whatThisCovers: '', frequency: 'Monthly',
  }
  const ratedKpa: ManagerKpa = {
    key: 'test_rated', rank: 2, name: 'Test Rated', pillar: 'collaboration_leadership', weight: 40, method: 'rated',
    sourceTlKpiKeys: null, sourceTlKpaLabel: null, whatThisCovers: '', frequency: 'Monthly',
  }

  const scores: EfficiencyScore[] = [
    score('tl1', 'team_sla_adherence', 95), // -> 100%
    score('tl2', 'team_sla_adherence', 82), // amber -> 50%
  ]
  const rating: ManagerKpaRating = {
    manager_id: 'mgr', month: '2026-09-01', kpa_key: 'test_rated',
    self_rating: 3, self_evidence: null, reviewer_rating: null, reviewer_comments: null, agreed_action: null, updated_at: '',
  }

  function ctx(overrides: Partial<ManagerKpaComputeContext> = {}): ManagerKpaComputeContext {
    return { teamLeaders, teamSizes, scores, weighting: 'equal', ...overrides }
  }

  it('computes a Roll-Up KPA from real per-KPI TL scores, department-averaged', () => {
    const computed = computeManagerKpa(rollupKpa, '2026-09-01', ctx())
    expect(computed.scorePct).toBe(75) // mean of 100 and 50
    expect(computed.contributions).toHaveLength(2)
  })

  it('computes a Rated KPA from the self rating when unreviewed', () => {
    const computed = computeManagerKpa(ratedKpa, '2026-09-01', ctx({ rating }))
    expect(computed.scorePct).toBe(100)
    expect(computed.contributions).toBeNull()
  })

  it('overallAndPillars weights the two KPAs and redistributes around any N/A/unscored one', () => {
    const kpas: ManagerKpaComputed[] = [
      computeManagerKpa(rollupKpa, '2026-09-01', ctx()),
      computeManagerKpa(ratedKpa, '2026-09-01', ctx({ rating })),
    ]
    // 0.6*75 + 0.4*100 = 45 + 40 = 85
    expect(overallAndPillars(kpas).overallPct).toBe(85)
  })

  it('redistributes fully onto the remaining KPA when one has nothing scored', () => {
    const kpas: ManagerKpaComputed[] = [
      computeManagerKpa(rollupKpa, '2026-09-01', ctx()),
      computeManagerKpa(ratedKpa, '2026-09-01', ctx({ rating: undefined })), // unrated -> null
    ]
    expect(overallAndPillars(kpas).overallPct).toBe(75) // the roll-up alone, not diluted by a phantom 0
  })

  it('returns null overall and "No data" RAG when nothing is scored at all', () => {
    const kpas: ManagerKpaComputed[] = [
      computeManagerKpa(rollupKpa, '2026-09-01', ctx({ scores: [] })),
      computeManagerKpa(ratedKpa, '2026-09-01', ctx({ rating: undefined })),
    ]
    const { overallPct } = overallAndPillars(kpas)
    expect(overallPct).toBeNull()
    expect(managerRag(overallPct)).toBe('no_data')
  })

  it('isProvisional stays true until every Rated KPA has a reviewer rating', () => {
    const unreviewed = [computeManagerKpa(ratedKpa, '2026-09-01', ctx({ rating }))]
    expect(isProvisional(unreviewed)).toBe(true)

    const reviewed = [computeManagerKpa(ratedKpa, '2026-09-01', ctx({ rating: { ...rating, reviewer_rating: 3 } }))]
    expect(isProvisional(reviewed)).toBe(false)
  })
})

describe('MANAGER_KPAS config', () => {
  it('weights sum to exactly 100', () => {
    expect(MANAGER_KPAS.reduce((sum, k) => sum + k.weight, 0)).toBe(100)
  })

  it('has 11 KPAs, ranked 1 through 11 with no gaps', () => {
    expect(MANAGER_KPAS).toHaveLength(11)
    expect(MANAGER_KPAS.map((k) => k.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('every Roll-Up KPA has source keys and every Rated KPA has none', () => {
    for (const kpa of MANAGER_KPAS) {
      if (kpa.method === 'rollup') expect(kpa.sourceTlKpiKeys?.length).toBeGreaterThan(0)
      else expect(kpa.sourceTlKpiKeys).toBeNull()
    }
  })
})
