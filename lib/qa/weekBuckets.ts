// Groups a month's QA reviews into "week" columns for the My QA board
// (components/qa/MyQaBoard.tsx). Pure day-of-month buckets, not calendar
// (Mon-Sun) weeks — Week 1 is always days 1-7, Week 2 is 8-14, and so on —
// so a review on the 1st never bleeds into the previous month's column.
// A month longer than 28 days gets a short 5th bucket for the leftover
// days (29-30, 29-31, or just day 29 in a leap February) rather than
// stretching Week 4 unevenly.

export interface WeekBucket {
  weekNumber: number
  startDay: number
  endDay: number
}

export function computeWeekBuckets(daysInMonth: number): WeekBucket[] {
  const buckets: WeekBucket[] = []
  let day = 1
  let weekNumber = 1
  while (day <= daysInMonth) {
    const endDay = Math.min(day + 6, daysInMonth)
    buckets.push({ weekNumber, startDay: day, endDay })
    day = endDay + 1
    weekNumber += 1
  }
  return buckets
}

/** Extracts the day-of-month from a 'YYYY-MM-DD' date string without any
 *  timezone-sensitive Date parsing — interaction_date is a DB `date` column,
 *  returned as this exact wire-format string (see lib/db/pool.ts's type
 *  parser override). */
function dayOfMonth(dateStr: string): number {
  return Number(dateStr.slice(8, 10))
}

export interface WeekGroup<T> {
  weekNumber: number
  startDay: number
  endDay: number
  reviews: T[]
}

export function groupReviewsByWeek<T extends { interaction_date: string }>(
  reviews: T[],
  buckets: WeekBucket[],
): WeekGroup<T>[] {
  const groups: WeekGroup<T>[] = buckets.map((b) => ({ ...b, reviews: [] }))
  for (const review of reviews) {
    const day = dayOfMonth(review.interaction_date)
    const bucket = groups.find((g) => day >= g.startDay && day <= g.endDay) ?? groups[groups.length - 1]
    bucket.reviews.push(review)
  }
  for (const group of groups) {
    group.reviews.sort((a, b) => a.interaction_date.localeCompare(b.interaction_date))
  }
  return groups
}

/** Business rule: each agent should receive at least this many QA reviews
 *  per week. Shown as a completion indicator on each week column's header —
 *  not enforced anywhere, purely informational for now. */
export const ASSESSMENTS_PER_WEEK_TARGET = 3
