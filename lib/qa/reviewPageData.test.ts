jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))

import { normalizeReview, reviewItemsToInputs } from './reviewPageData'
import type { QaReviewItem } from '@/types'

const item = (item_code: QaReviewItem['item_code'], written_value: string | null, call_value: string | null): QaReviewItem => ({
  id: item_code, review_id: 'r', item_code, written_value, call_value,
  points_snapshot: 1, used: 1, earned: 1, comments: null, evidence: null,
})

describe('normalizeReview', () => {
  it('coerces numeric strings and keeps null', () => {
    expect(normalizeReview({ raw_score: '80.5', final_score: '85.0' })).toEqual({ raw_score: 80.5, final_score: 85 })
    expect(normalizeReview({ raw_score: null, final_score: null })).toEqual({ raw_score: null, final_score: null })
  })
})

describe('reviewItemsToInputs', () => {
  it('orders by scorecard order and maps legs', () => {
    const out = reviewItemsToInputs([item('Q1', null, null), item('C1', 'yes', 'no')])
    expect(out.map((i) => i.code)).toEqual(['C1', 'Q1'])
    expect(out[0]).toMatchObject({ written: 'yes', call: 'no' })
  })
})
