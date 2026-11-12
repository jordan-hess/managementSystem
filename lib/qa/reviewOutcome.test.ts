import { buildReviewOutcome } from './reviewOutcome'
import type { ItemCode, ItemInput, LegValue } from './scorecard'

const settings = { passMark: 75, excellentFrom: 85, criticalFailCap: 60 }
const item = (code: ItemCode, written: LegValue, call: LegValue = 'na'): ItemInput => ({ code, written, call })

describe('buildReviewOutcome', () => {
  it('explains a critical fail by the missed critical item and its reason tags', () => {
    const o = buildReviewOutcome({
      rating: 'Fail (Critical)', finalScore: 60, settings,
      items: [item('C1', 'no'), item('C2', 'yes'), item('C3', 'yes', 'no')],
      reasonTags: [{ name: 'Details requested publicly', item_code: 'C1' }],
    })
    expect(o.result).toBe('Fail')
    expect(o.headline).toBe('Failed on a critical item — score capped at 60%.')
    expect(o.reasons).toEqual([
      'Critical item missed: Verification & data protection (Details requested publicly)',
      'Critical item missed: Professional conduct',
    ])
  })

  it('explains a score fail against the pass mark, lowest ratings first, then missed must-dos', () => {
    const o = buildReviewOutcome({
      rating: 'Fail', finalScore: 68.5, settings, reasonTags: [],
      items: [item('B2', 'no'), item('Q1', 2, 4), item('Q4', 1), item('Q2', 3)],
    })
    expect(o).toEqual({
      result: 'Fail',
      headline: 'Scored 68.5%, below the 75% pass mark.',
      reasons: ['Communication, Empathy & Conversation Control: 1/5', 'Understanding & Investigation: 2/5', 'Not done: Verbatim closing question'],
    })
  })

  it('explains a pass and lists what is still worth working on', () => {
    const o = buildReviewOutcome({ rating: 'Excellent', finalScore: 92, settings, reasonTags: [], items: [item('B3', 'no')] })
    expect(o).toEqual({
      result: 'Pass',
      headline: 'Scored 92%, at or above the 75% pass mark — rated Excellent.',
      reasons: ['Not done: Recap'],
    })
  })

  it('caps the reasons at four', () => {
    const o = buildReviewOutcome({
      rating: 'Fail', finalScore: 40, settings, reasonTags: [],
      items: [item('Q1', 0), item('Q2', 1), item('Q3', 2), item('Q4', 2), item('B1', 'no')],
    })
    expect(o.reasons).toHaveLength(4)
  })

  it('handles an unrated review and missing settings', () => {
    expect(buildReviewOutcome({ rating: '', finalScore: null, settings, reasonTags: [], items: [] }).result).toBe('Not rated')
    expect(buildReviewOutcome({ rating: 'Good', finalScore: 80, settings: null, reasonTags: [], items: [] }).headline).toBe('Scored 80%.')
  })
})
