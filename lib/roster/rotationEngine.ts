/**
 * The entire "the rotation never resets" mechanism, in one pure function.
 * Knows nothing about profiles, positions, attendance, overrides, months,
 * or weeks — it only answers "given this pattern and this date, what shift
 * applies?" Requesting any date, in any month or year, past or future, goes
 * through the identical calculation; there is no month-boundary branch.
 */

export type Shift = 'EARLY' | 'LATE' | 'OFF'

export interface RotationPattern {
  shiftSequence: Shift[]
  /** 'YYYY-MM-DD' — the calendar date shiftSequence[0] applies to. */
  anchorDate: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseDateUTC(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Whole days from `anchorDate` to `date` — negative when `date` precedes `anchorDate`. */
export function daysSince(anchorDate: string, date: string): number {
  return Math.round((parseDateUTC(date) - parseDateUTC(anchorDate)) / MS_PER_DAY)
}

/** Cycle length is whatever the pattern's own sequence length is — not a
 *  fixed constant. The 4 original team patterns happen to be 28 days; a
 *  personal pattern built from a full source month can be a different
 *  length (e.g. 30) without needing a different formula. */
export function shiftForDate(pattern: RotationPattern, date: string): Shift {
  const cycleLength = pattern.shiftSequence.length
  const offset = ((daysSince(pattern.anchorDate, date) % cycleLength) + cycleLength) % cycleLength
  return pattern.shiftSequence[offset]
}
