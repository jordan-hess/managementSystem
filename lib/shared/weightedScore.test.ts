import { scoreWeighted } from './weightedScore'

describe('scoreWeighted', () => {
  it('weights a full-marks set to 100%', () => {
    const result = scoreWeighted([
      { id: 'a', weight: 40, scorePct: 1 },
      { id: 'b', weight: 60, scorePct: 1 },
    ])
    expect(result.pct).toBe(100)
    expect(result.totalWeightApplicable).toBe(100)
    expect(result.totalWeightExcluded).toBe(0)
  })

  it('excludes a null-scorePct item from both numerator and denominator', () => {
    const result = scoreWeighted([
      { id: 'a', weight: 70, scorePct: 1 },
      { id: 'b', weight: 30, scorePct: null },
    ])
    expect(result.totalWeightExcluded).toBe(30)
    expect(result.totalWeightApplicable).toBe(70)
    expect(result.pct).toBe(100)
  })

  it('a scorePct of 0 still counts its weight in the denominator (unlike null)', () => {
    const result = scoreWeighted([
      { id: 'a', weight: 80, scorePct: 1 },
      { id: 'b', weight: 20, scorePct: 0 },
    ])
    expect(result.totalWeightApplicable).toBe(100)
    expect(result.pct).toBe(80)
  })

  it('returns null pct (not 0) when every item is excluded', () => {
    const result = scoreWeighted([
      { id: 'a', weight: 50, scorePct: null },
      { id: 'b', weight: 50, scorePct: null },
    ])
    expect(result.totalWeightApplicable).toBe(0)
    expect(result.pct).toBeNull()
  })

  it('returns null pct for an empty item list', () => {
    expect(scoreWeighted([]).pct).toBeNull()
  })

  it('matches hand-calculated math for mixed weights and scores', () => {
    // 0.4*20 + 0.9*30 + 0.6*50 = 8 + 27 + 30 = 65, / 100 = 65%
    const result = scoreWeighted([
      { id: 'a', weight: 20, scorePct: 0.4 },
      { id: 'b', weight: 30, scorePct: 0.9 },
      { id: 'c', weight: 50, scorePct: 0.6 },
    ])
    expect(result.weightedSum).toBe(65)
    expect(result.pct).toBe(65)
  })

  it('reports each item\'s own contribution, 0 when excluded', () => {
    const result = scoreWeighted([
      { id: 'a', weight: 10, scorePct: 0.5 },
      { id: 'b', weight: 10, scorePct: null },
    ])
    expect(result.perItem.find((i) => i.id === 'a')?.contribution).toBe(5)
    expect(result.perItem.find((i) => i.id === 'b')?.contribution).toBe(0)
  })
})
