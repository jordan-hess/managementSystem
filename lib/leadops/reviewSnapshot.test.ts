import { EFFICIENCY_METRIC_DEFS } from './constants'
import { PLANNER_DERIVED_KEYS, SNAPSHOT_VERSION, buildReviewSnapshot, diffSnapshots, type WeeklyFigures } from './reviewSnapshot'
import type { EfficiencyScore } from './types'

const WEEKLY: WeeklyFigures = { weeks: 4, calibrationAttended: 3, coachingSessions: 9, agentInSeatDays: 2, criticalFails: 1, reAudits: 6 }
const manualKey = EFFICIENCY_METRIC_DEFS.find((d) => d.inputMode !== 'derived')!.key

const score = (key: string, over: Partial<EfficiencyScore> = {}): EfficiencyScore => ({
  id: `s-${key}`, tl_id: 'tl-1', period: '2026-10-01', metric_key: key, self_value: 90, is_na: false, na_reason: null,
  verified_value: null, status: 'self_reported', verified_by: null, verified_at: null, verification_note: null, updated_at: '', ...over,
})

const build = (scores: EfficiencyScore[] = [], weekly = WEEKLY, extra: Partial<Parameters<typeof buildReviewSnapshot>[0]> = {}) =>
  buildReviewSnapshot({ period: '2026-10-01', teamLeaderName: 'Taylor', sharedByName: 'Alex', takenAt: '2026-11-03T12:20:00.000Z', scores, weekly, ...extra })

describe('buildReviewSnapshot', () => {
  it('is versioned and stamped, and carries the names as they were', () => {
    const s = build()
    expect(s.version).toBe(SNAPSHOT_VERSION)
    expect(s.takenAt).toBe('2026-11-03T12:20:00.000Z')
    expect(s.teamLeaderName).toBe('Taylor')
    expect(s.sharedByName).toBe('Alex')
    expect(s.weekly).toEqual(WEEKLY)
  })

  it('lists every KPI definition, with its thresholds, unit and direction frozen in', () => {
    const s = build()
    expect(s.kpis).toHaveLength(EFFICIENCY_METRIC_DEFS.length)
    const def = EFFICIENCY_METRIC_DEFS.find((d) => d.key === manualKey)!
    const kpi = s.kpis.find((k) => k.key === manualKey)!
    expect(kpi).toMatchObject({ name: def.kpi, category: def.category, unit: def.unit, direction: def.direction, green: def.green, amber: def.amber })
  })

  it('stores COMPUTED results: actual, score, band and verification status exactly as scored', () => {
    const def = EFFICIENCY_METRIC_DEFS.find((d) => d.key === manualKey)!
    const value = def.direction === 'lower_better' ? def.green : def.green + 1 // meets green either way
    const s = build([score(manualKey, { self_value: value, verified_value: value, status: 'verified' })])
    const kpi = s.kpis.find((k) => k.key === manualKey)!
    expect(kpi).toMatchObject({ actual: value, score: 2, band: 'green', status: 'verified', isNa: false, notTracked: false })
  })

  it('stores N/A with its reason and excludes it from the overall', () => {
    const s = build([score(manualKey, { is_na: true, na_reason: 'No QA this month', self_value: null })])
    const kpi = s.kpis.find((k) => k.key === manualKey)!
    expect(kpi).toMatchObject({ isNa: true, naReason: 'No QA this month', actual: null, score: null })
    expect(s.overall.possible).toBe(0)
  })

  it('stores the planner-derived KPIs as NOT TRACKED, even if a score row exists for them', () => {
    const s = build(PLANNER_DERIVED_KEYS.map((k) => score(k, { self_value: 75 })))
    for (const key of PLANNER_DERIVED_KEYS) {
      expect(s.kpis.find((k) => k.key === key)).toMatchObject({ notTracked: true, actual: null, score: null, band: null })
    }
    expect(s.overall.possible).toBe(0) // not-tracked KPIs never count toward the denominator
  })

  it('counts a captured-but-unverified figure as unverified', () => {
    expect(build([score(manualKey)]).unverifiedCount).toBe(1)
    expect(build([score(manualKey, { status: 'verified', verified_value: 90 })]).unverifiedCount).toBe(0)
  })

  it('is plain JSON (it is stored in a jsonb column and read back by the renderer)', () => {
    const s = build([score(manualKey)])
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })
})

describe('diffSnapshots — what changed since the review was shared', () => {
  it('reports nothing when the figures are the same (only the time differs)', () => {
    const a = build([score(manualKey)])
    const b = build([score(manualKey)], WEEKLY, { takenAt: '2026-11-09T08:00:00.000Z' })
    expect(diffSnapshots(a, b)).toEqual([])
  })

  it('reports a changed KPI value with old and new side by side', () => {
    const def = EFFICIENCY_METRIC_DEFS.find((d) => d.key === manualKey)!
    const a = build([score(manualKey, { self_value: 50 })])
    const b = build([score(manualKey, { self_value: 51 })])
    const changes = diffSnapshots(a, b)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({ label: def.kpi, before: `50${def.unit} · Unverified`, after: `51${def.unit} · Unverified` })
  })

  it("reports a verification-status change on its own, an N/A change and a weekly total change", () => {
    const a = build([score(manualKey)])
    const verified = build([score(manualKey, { status: 'verified', verified_value: 90 })], { ...WEEKLY, coachingSessions: 10 })
    const labels = diffSnapshots(a, verified).map((c) => c.label)
    expect(labels).toContain('Coaching sessions')
    expect(labels.length).toBe(2) // the verified badge flipped on the KPI (same value) and one weekly total changed
    const na = build([score(manualKey, { is_na: true, na_reason: 'x', self_value: null })])
    expect(diffSnapshots(a, na)).toHaveLength(1)
  })

  it('reports a figure that was not captured and now is', () => {
    const a = build()
    const b = build([score(manualKey, { self_value: 40 })])
    expect(diffSnapshots(a, b)).toHaveLength(1)
    expect(diffSnapshots(a, b)[0].before).toBe('—')
  })
})
