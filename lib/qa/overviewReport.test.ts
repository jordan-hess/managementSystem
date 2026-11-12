import { buildOverviewReport, NO_CATEGORY, NO_TEAM_LEADER, type OverviewCategory, type OverviewReviewRow } from './overviewReport'

const review = (over: Partial<OverviewReviewRow> & { id: string }): OverviewReviewRow => ({
  department: 'Social', rating_label: 'Good', final_score: 80, category_id: 'net', root_cause_type_ids: [], team_leader_name: 'Taylor', ...over,
})

const reviews: OverviewReviewRow[] = [
  review({ id: 'r1', rating_label: 'Excellent', final_score: 90, root_cause_type_ids: ['t-comm'] }),
  review({ id: 'r2', rating_label: 'Fail', final_score: 60, root_cause_type_ids: ['t-comm'] }),
  review({ id: 'r3', rating_label: 'Good', final_score: 85, category_id: 'bill', team_leader_name: 'Riley' }),
  review({ id: 'r4', department: 'T2', rating_label: 'Fail (Critical)', final_score: 50, category_id: null, team_leader_name: null, root_cause_type_ids: ['t-beh'] }),
]
const types = [
  { id: 't-comm', name: 'Communication', always_listed: true },
  { id: 't-km', name: 'Knowledge Gap', always_listed: true },
  { id: 't-beh', name: 'Behaviour', always_listed: true },
  { id: 't-old', name: 'Retired cause', always_listed: false },
]
const categoryList: OverviewCategory[] = [
  { id: 'net', department: 'Social', name: 'Network', always_listed: true },
  { id: 'bill', department: 'Social', name: 'Billing', always_listed: true },
  { id: 'logi', department: 'Social', name: 'Logistics', always_listed: true },
  { id: 'gone', department: 'Social', name: 'Retired', always_listed: false },
  { id: 'adv', department: 'T2', name: 'Advanced', always_listed: true },
]

describe('buildOverviewReport', () => {
  const report = buildOverviewReport(reviews, types, categoryList)

  it('computes pass rate and average score per department, with null for an empty one', () => {
    expect(report.departments).toEqual([
      { department: 'Social', total: 3, passCount: 2, passRate: 66.7, averageScore: 78.3 },
      { department: 'T2', total: 1, passCount: 0, passRate: 0, averageScore: 50 },
      { department: 'Billing', total: 0, passCount: 0, passRate: null, averageScore: null },
    ])
  })

  it('groups team leaders per department, alphabetically, with no-leader last', () => {
    expect(report.teamLeaders.map((t) => [t.teamLeader, t.department, t.total, t.passRate])).toEqual([
      ['Riley', 'Social', 1, 100],
      ['Taylor', 'Social', 2, 50],
      [NO_TEAM_LEADER, 'T2', 1, 0],
    ])
  })

  it('counts each review under its root causes and lists every active cause, zeros included', () => {
    expect(report.rootCauses).toEqual([
      { name: 'Communication', counts: { Social: 2, T2: 0, Billing: 0 }, combined: 2 },
      { name: 'Knowledge Gap', counts: { Social: 0, T2: 0, Billing: 0 }, combined: 0 },
      { name: 'Behaviour', counts: { Social: 0, T2: 1, Billing: 0 }, combined: 1 },
    ])
  })

  it('shows a retired root cause only once it has a count', () => {
    const r = buildOverviewReport([review({ id: 'x', root_cause_type_ids: ['t-old'] })], types, [])
    expect(r.rootCauses.map((c) => c.name)).toContain('Retired cause')
  })

  it('counts a review under every root cause it has, but each cause once', () => {
    const r = buildOverviewReport([review({ id: 'x', root_cause_type_ids: ['t-comm', 't-km', 't-comm'] })], types, [])
    expect(r.rootCauses.slice(0, 2).map((c) => [c.name, c.combined])).toEqual([['Communication', 1], ['Knowledge Gap', 1]])
  })

  it('lists the managed categories in order with zero counts, and uncategorised reviews last', () => {
    expect(report.categories.Social.map((c) => [c.category, c.total, c.passRate])).toEqual([
      ['Network', 2, 50],
      ['Billing', 1, 100],
      ['Logistics', 0, null],
    ])
    expect(report.categories.T2.map((c) => [c.category, c.total])).toEqual([['Advanced', 0], [NO_CATEGORY, 1]])
    expect(report.categories.Billing).toEqual([])
  })

  it('keeps a retired category that a review in the period still uses', () => {
    const r = buildOverviewReport([review({ id: 'x', category_id: 'gone' })], types, categoryList)
    expect(r.categories.Social.map((c) => c.category)).toEqual(['Network', 'Billing', 'Logistics', 'Retired'])
  })

  it('limits every section to the given departments', () => {
    const t2Only = buildOverviewReport(reviews.filter((r) => r.department === 'T2'), types, categoryList, ['T2'])
    expect(t2Only.departments.map((d) => d.department)).toEqual(['T2'])
    expect(t2Only.rootCauses[2]).toEqual({ name: 'Behaviour', counts: { Social: 0, T2: 1, Billing: 0 }, combined: 1 })
  })
})
