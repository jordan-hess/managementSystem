import { identifyCoachingOpportunities } from './coachingOpportunities'
import { ItemCode, ItemInput, LegValue } from './scorecard'

function item(code: ItemCode, written: LegValue, call: LegValue): ItemInput {
  return { code, written, call }
}

describe('identifyCoachingOpportunities', () => {
  it('single B No -> no must-do suggestion', () => {
    const r = identifyCoachingOpportunities({ items: [item('B1', 'yes', 'no'), item('B2', 'yes', 'yes')], coachingFlags: [] })
    expect(r).toEqual([])
  })

  it('two B Nos -> two suggestions', () => {
    const r = identifyCoachingOpportunities({ items: [item('B1', 'no', null), item('B3', 'yes', 'no')], coachingFlags: [] })
    expect(r).toEqual([
      { label: 'Greeting & acknowledgement', reason: 'Must-do behaviour missed' },
      { label: 'Recap', reason: 'Must-do behaviour missed' },
    ])
  })

  it('Q 5/2 -> one low-rating suggestion naming Call', () => {
    const r = identifyCoachingOpportunities({ items: [item('Q1', 5, 2)], coachingFlags: [] })
    expect(r).toEqual([{ label: 'Understanding & Investigation', reason: 'Scored 2/5 (Call)' }])
  })

  it('Q written low names Written', () => {
    const r = identifyCoachingOpportunities({ items: [item('Q2', 1, 'na')], coachingFlags: [] })
    expect(r[0].reason).toBe('Scored 1/5 (Written)')
  })

  it('C1 fail -> critical suggestion', () => {
    const r = identifyCoachingOpportunities({ items: [item('C1', 'yes', 'no')], coachingFlags: [] })
    expect(r).toEqual([{ label: 'Verification & data protection', reason: 'Critical item failed' }])
  })

  it('flag requiresCoaching -> suggestion; others ignored', () => {
    const r = identifyCoachingOpportunities({
      items: [],
      coachingFlags: [
        { name: 'Privacy violation', requiresCoaching: true },
        { name: 'Other', requiresCoaching: false },
      ],
    })
    expect(r).toEqual([{ label: 'Privacy violation', reason: 'Critical failure: Privacy violation' }])
  })

  it('returns an empty array when no rule fires', () => {
    expect(identifyCoachingOpportunities({ items: [], coachingFlags: [] })).toEqual([])
  })
})
