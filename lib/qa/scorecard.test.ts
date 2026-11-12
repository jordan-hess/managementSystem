import {
  SCORECARD_ITEMS,
  RATING_NAMES,
  scoreScorecard,
  resolveSettings,
  applyLegs,
  missingCriticals,
  itemPasses,
  rateScore,
  bandsLegend,
  toDbLeg,
  fromDbLeg,
  ItemCode,
  ItemInput,
  LegValue,
  SettingsRow,
} from './scorecard'

const S = { passMark: 75, excellentFrom: 85, criticalFailCap: 60 }

const ORDER: ItemCode[] = ['C1', 'C2', 'C3', 'B1', 'B2', 'B3', 'B4', 'Q1', 'Q2', 'Q3', 'Q4']

function items(partial: Partial<Record<ItemCode, [LegValue, LegValue]>>): ItemInput[] {
  return (Object.keys(partial) as ItemCode[]).map((code) => ({
    code,
    written: partial[code]![0],
    call: partial[code]![1],
  }))
}

const CASE_B: Partial<Record<ItemCode, [LegValue, LegValue]>> = {
  C1: ['yes', 'yes'], C2: ['yes', 'na'], C3: ['yes', 'yes'],
  B1: ['yes', 'yes'], B2: ['yes', 'no'], B3: ['yes', 'na'], B4: ['yes', 'yes'],
  Q1: [4, 5], Q2: [3, 4], Q3: [5, 'na'], Q4: [4, 4],
}

describe('SCORECARD_ITEMS', () => {
  it('defines C1..Q4 in order with the spec points', () => {
    expect(SCORECARD_ITEMS.map((i) => i.code)).toEqual(ORDER)
    expect(SCORECARD_ITEMS.map((i) => i.points)).toEqual([0, 0, 0, 10, 10, 5, 10, 10, 20, 20, 15])
  })
  it('has six anchors on Q rows and guidance on C/B rows', () => {
    for (const i of SCORECARD_ITEMS) {
      if (i.section === 'quality') expect(i.anchors).toHaveLength(6)
      else expect(i.yesWhen && i.noWhen).toBeTruthy()
    }
    expect(RATING_NAMES[5]).toBe('Excellent')
  })
})

describe('scoreScorecard', () => {
  it('case A', () => {
    const r = scoreScorecard(items({ B1: ['yes', 'no'], B2: ['no', null], B3: ['no', null], B4: ['no', null] }), S)
    expect(r.earned).toBe(5)
    expect(r.used).toBe(35)
    expect(r.raw).toBe(14.3)
    expect(r.rating).toBe('Fail')
  })

  it('case B', () => {
    const r = scoreScorecard(items(CASE_B), S)
    expect(r.earned).toBe(85)
    expect(r.used).toBe(100)
    expect(r.final).toBe(85)
    expect(r.rating).toBe('Excellent')
  })

  it('case C: critical No caps the score', () => {
    const r = scoreScorecard(items({ ...CASE_B, C1: ['yes', 'no'] }), S)
    expect(r.raw).toBe(85)
    expect(r.final).toBe(60)
    expect(r.rating).toBe('Fail (Critical)')
    expect(r.failedCriticals).toEqual(['C1'])
  })

  it('case D: written only', () => {
    const r = scoreScorecard(
      items({
        C1: ['yes', 'na'],
        B1: ['yes', 'na'], B2: ['no', 'na'], B3: ['yes', 'na'], B4: ['yes', 'na'],
        Q1: [4, 'na'], Q2: [4, 'na'], Q3: [4, 'na'], Q4: [3, 'na'],
      }),
      S,
    )
    expect(r.earned).toBe(74)
    expect(r.used).toBe(100)
    expect(r.final).toBe(74)
    expect(r.rating).toBe('Fail')
  })

  it('case E: everything blank', () => {
    const blank = ORDER.map((code) => ({ code, written: null, call: null })) as ItemInput[]
    const r = scoreScorecard(blank, S)
    expect(r.raw).toBeNull()
    expect(r.final).toBeNull()
    expect(r.rating).toBe('')
    expect(r.closingLine).toBeNull()
    expect(() => scoreScorecard([], S)).not.toThrow()
  })

  it('rounds a decimal cap to 1 dp and rates from the rounded value', () => {
    const r = scoreScorecard(items({ ...CASE_B, C1: ['yes', 'no'] }), { ...S, criticalFailCap: 60.25 })
    expect(r.raw).toBe(85)
    expect(r.final).toBe(60.3)
    expect(r.rating).toBe('Fail (Critical)')
    const r2 = scoreScorecard(items({ ...CASE_B, C1: ['yes', 'no'] }), { ...S, criticalFailCap: 84.96 })
    expect(r2.final).toBe(85)
    expect(r2.rating).toBe('Fail (Critical)')
  })

  it('non-critical boundary rates on the 1-dp value', () => {
    expect(rateScore(84.9, false, S)).toBe('Good')
    expect(rateScore(85, false, S)).toBe('Excellent')
  })

  it('case F: strict cap of 0', () => {
    const r = scoreScorecard(items({ ...CASE_B, C1: ['no', 'yes'] }), { ...S, criticalFailCap: 0 })
    expect(r.final).toBe(0)
    expect(r.rating).toBe('Fail (Critical)')
  })

  it('B2 NA on both legs gives closingLine NA and is left out of the denominator', () => {
    const r = scoreScorecard(items({ B1: ['yes', 'yes'], B2: ['na', 'na'] }), S)
    expect(r.closingLine).toBe('NA')
    expect(r.perItem.find((p) => p.code === 'B2')!.used).toBe(0)
    expect(r.used).toBe(10)
  })

  it('closing line follows B2: No beats Yes', () => {
    expect(scoreScorecard(items({ B2: ['yes', 'no'] }), S).closingLine).toBe('No')
    expect(scoreScorecard(items({ B2: ['yes', 'na'] }), S).closingLine).toBe('Yes')
  })

  it('critical No only: no score but Fail (Critical)', () => {
    const r = scoreScorecard(items({ C2: ['no', null] }), S)
    expect(r.final).toBeNull()
    expect(r.rating).toBe('Fail (Critical)')
  })

  it('critical statuses: FAIL > PASS > NA > blank', () => {
    const r = scoreScorecard(items({ C1: ['no', 'yes'], C2: ['yes', 'na'], C3: ['na', 'na'] }), S)
    expect(r.perItem.map((p) => p.status).slice(0, 3)).toEqual(['FAIL', 'PASS', 'NA'])
    expect(scoreScorecard(items({ C1: [null, null] }), S).perItem[0].status).toBe('')
  })
})

describe('rateScore', () => {
  it('boundaries', () => {
    expect([74.9, 75, 84.9, 85].map((x) => rateScore(x, false, S))).toEqual(['Fail', 'Good', 'Good', 'Excellent'])
  })
  it('critical wins, even with null or a high score', () => {
    expect(rateScore(null, true, S)).toBe('Fail (Critical)')
    expect(rateScore(95, true, S)).toBe('Fail (Critical)')
  })
  it('empty', () => {
    expect(rateScore(null, false, S)).toBe('')
  })
})

describe('bandsLegend', () => {
  it('is built from settings', () => {
    expect(bandsLegend(S)).toBe('Fail < 75 · Good 75–84.9 · Excellent ≥ 85 · any critical No = Fail (capped at 60)')
  })
})

describe('resolveSettings', () => {
  const rows: SettingsRow[] = [
    { id: 'b', effectiveFrom: '2026-11-01', passMark: 80, excellentFrom: 90, criticalFailCap: 50 },
    { id: 'a', effectiveFrom: '1900-01-01', ...S },
  ]
  it('picks the latest effectiveFrom <= date', () => {
    expect(resolveSettings(rows, '2026-10-31')!.id).toBe('a')
    expect(resolveSettings(rows, '2026-11-01')!.id).toBe('b')
  })
  it('returns null when none apply', () => {
    expect(resolveSettings(rows, '1800-01-01')).toBeNull()
  })
})

describe('applyLegs', () => {
  const input = items({ B1: ['yes', 'no'], Q1: [3, 4] })
  it('written forces call to na', () => {
    expect(applyLegs(input, 'written').map((i) => i.call)).toEqual(['na', 'na'])
  })
  it('call forces written to na', () => {
    expect(applyLegs(input, 'call').map((i) => i.written)).toEqual(['na', 'na'])
  })
  it('both is unchanged', () => {
    expect(applyLegs(input, 'both')).toEqual(input)
  })
})

describe('missingCriticals', () => {
  it('lists unanswered critical legs', () => {
    const r = missingCriticals(items({ C1: ['yes', null] }), 'both')
    expect(r).toEqual([
      { code: 'C1', leg: 'call' },
      { code: 'C2', leg: 'written' },
      { code: 'C2', leg: 'call' },
      { code: 'C3', leg: 'written' },
      { code: 'C3', leg: 'call' },
    ])
  })
  it('only asks for the legs in use', () => {
    expect(missingCriticals([], 'call')).toEqual([
      { code: 'C1', leg: 'call' }, { code: 'C2', leg: 'call' }, { code: 'C3', leg: 'call' },
    ])
  })
})

describe('itemPasses', () => {
  it('Q 5/2 fails, B yes/no fails, C na/null is unscored', () => {
    expect(itemPasses({ code: 'Q1', written: 5, call: 2 })).toBe(false)
    expect(itemPasses({ code: 'B1', written: 'yes', call: 'no' })).toBe(false)
    expect(itemPasses({ code: 'C1', written: 'na', call: null })).toBeNull()
  })
  it('passes when scored and clean', () => {
    expect(itemPasses({ code: 'Q1', written: 3, call: 'na' })).toBe(true)
    expect(itemPasses({ code: 'B1', written: 'yes', call: null })).toBe(true)
  })
})

describe('db round-trip', () => {
  it('maps legs to and from text', () => {
    expect(fromDbLeg('Q1', '3')).toBe(3)
    expect(toDbLeg(3)).toBe('3')
    expect(toDbLeg(0)).toBe('0')
    expect(toDbLeg(null)).toBeNull()
    expect(fromDbLeg('B1', 'yes')).toBe('yes')
    expect(fromDbLeg('Q1', 'na')).toBe('na')
    expect(fromDbLeg('Q1', null)).toBeNull()
  })
})
