import { computeWeekBuckets, groupReviewsByWeek, ASSESSMENTS_PER_WEEK_TARGET } from './weekBuckets'

describe('computeWeekBuckets', () => {
  it('splits a 28-day month into exactly 4 buckets of 7 days', () => {
    expect(computeWeekBuckets(28)).toEqual([
      { weekNumber: 1, startDay: 1, endDay: 7 },
      { weekNumber: 2, startDay: 8, endDay: 14 },
      { weekNumber: 3, startDay: 15, endDay: 21 },
      { weekNumber: 4, startDay: 22, endDay: 28 },
    ])
  })

  it('splits a 30-day month into 4 full weeks plus a short 5th bucket', () => {
    expect(computeWeekBuckets(30)).toEqual([
      { weekNumber: 1, startDay: 1, endDay: 7 },
      { weekNumber: 2, startDay: 8, endDay: 14 },
      { weekNumber: 3, startDay: 15, endDay: 21 },
      { weekNumber: 4, startDay: 22, endDay: 28 },
      { weekNumber: 5, startDay: 29, endDay: 30 },
    ])
  })

  it('splits a 31-day month the same way, with a 3-day 5th bucket', () => {
    const buckets = computeWeekBuckets(31)
    expect(buckets).toHaveLength(5)
    expect(buckets[4]).toEqual({ weekNumber: 5, startDay: 29, endDay: 31 })
  })

  it('splits a 29-day leap-February into 4 full weeks plus a 1-day 5th bucket', () => {
    const buckets = computeWeekBuckets(29)
    expect(buckets).toHaveLength(5)
    expect(buckets[4]).toEqual({ weekNumber: 5, startDay: 29, endDay: 29 })
  })
})

describe('groupReviewsByWeek', () => {
  const buckets = computeWeekBuckets(30)

  it('assigns each review to the bucket containing its interaction_date day-of-month', () => {
    const reviews = [
      { id: 'a', interaction_date: '2026-04-01' },
      { id: 'b', interaction_date: '2026-04-07' },
      { id: 'c', interaction_date: '2026-04-08' },
      { id: 'd', interaction_date: '2026-04-21' },
      { id: 'e', interaction_date: '2026-04-30' },
    ]
    const grouped = groupReviewsByWeek(reviews, buckets)

    expect(grouped.find((g) => g.weekNumber === 1)?.reviews.map((r) => r.id)).toEqual(['a', 'b'])
    expect(grouped.find((g) => g.weekNumber === 2)?.reviews.map((r) => r.id)).toEqual(['c'])
    expect(grouped.find((g) => g.weekNumber === 3)?.reviews.map((r) => r.id)).toEqual(['d'])
    expect(grouped.find((g) => g.weekNumber === 5)?.reviews.map((r) => r.id)).toEqual(['e'])
  })

  it('returns an empty reviews array for a week with no reviews', () => {
    const grouped = groupReviewsByWeek([], buckets)
    expect(grouped.every((g) => g.reviews.length === 0)).toBe(true)
    expect(grouped).toHaveLength(5)
  })

  it('sorts reviews within a week by interaction_date ascending', () => {
    const reviews = [
      { id: 'later', interaction_date: '2026-04-05' },
      { id: 'earlier', interaction_date: '2026-04-02' },
    ]
    const grouped = groupReviewsByWeek(reviews, buckets)
    expect(grouped.find((g) => g.weekNumber === 1)?.reviews.map((r) => r.id)).toEqual(['earlier', 'later'])
  })
})

describe('ASSESSMENTS_PER_WEEK_TARGET', () => {
  it('is 3', () => {
    expect(ASSESSMENTS_PER_WEEK_TARGET).toBe(3)
  })
})
