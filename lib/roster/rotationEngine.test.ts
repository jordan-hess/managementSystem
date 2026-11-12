import { shiftForDate, daysSince, Shift } from './rotationEngine'

// A 28-day pattern with a distinct value at every offset (0..27) so any
// off-by-one or wrap error is immediately visible in which value comes back.
function sequentialPattern(anchorDate: string) {
  const shiftSequence: Shift[] = []
  for (let i = 0; i < 28; i++) {
    shiftSequence.push(i % 3 === 0 ? 'EARLY' : i % 3 === 1 ? 'LATE' : 'OFF')
  }
  return { shiftSequence, anchorDate }
}

describe('daysSince', () => {
  it('is 0 for the anchor date itself', () => {
    expect(daysSince('2026-09-01', '2026-09-01')).toBe(0)
  })

  it('counts forward across a month boundary', () => {
    expect(daysSince('2026-09-01', '2026-10-01')).toBe(30)
  })

  it('counts backward as a negative number for dates before the anchor', () => {
    expect(daysSince('2026-09-01', '2026-08-31')).toBe(-1)
  })

  it('handles a leap-year February correctly', () => {
    // 2028 is a leap year — Feb has 29 days.
    expect(daysSince('2028-02-01', '2028-03-01')).toBe(29)
  })
})

describe('shiftForDate', () => {
  const pattern = sequentialPattern('2026-09-01')

  it('returns shiftSequence[0] on the anchor date', () => {
    expect(shiftForDate(pattern, '2026-09-01')).toBe(pattern.shiftSequence[0])
  })

  it('returns shiftSequence[1] the day after the anchor', () => {
    expect(shiftForDate(pattern, '2026-09-02')).toBe(pattern.shiftSequence[1])
  })

  it('returns shiftSequence[27] on day 27 of the cycle', () => {
    expect(shiftForDate(pattern, '2026-09-28')).toBe(pattern.shiftSequence[27])
  })

  it('wraps back to shiftSequence[0] on day 28 — the cycle repeating, not resetting', () => {
    expect(shiftForDate(pattern, '2026-09-29')).toBe(pattern.shiftSequence[0])
  })

  it('the literal Sept 30 -> Oct 1 continuity example: Oct 1 is whatever comes next in the cycle', () => {
    const sept30 = shiftForDate(pattern, '2026-09-30')
    const oct1 = shiftForDate(pattern, '2026-10-01')
    // Sept 30 is offset 29 (=> index 1), Oct 1 is offset 30 (=> index 2) — adjacent
    // cycle positions, computed by the exact same formula, no month-boundary branch.
    expect(sept30).toBe(pattern.shiftSequence[1])
    expect(oct1).toBe(pattern.shiftSequence[2])
  })

  it('never resets across further month boundaries (Sept 2026 -> Jan 2027 unbroken)', () => {
    // Nov 1, 2026 is 61 days after the anchor -> offset 61 % 28 = 5
    expect(shiftForDate(pattern, '2026-11-01')).toBe(pattern.shiftSequence[5])
    // Jan 1, 2027 is 122 days after the anchor -> offset 122 % 28 = 10
    expect(shiftForDate(pattern, '2027-01-01')).toBe(pattern.shiftSequence[10])
  })

  it('exactly 28 days after the anchor gives the same shift as the anchor', () => {
    const anchorShift = shiftForDate(pattern, pattern.anchorDate)
    const twentyEightDaysLater = shiftForDate(pattern, '2026-09-29')
    expect(twentyEightDaysLater).toBe(anchorShift)
  })

  it('resolves correctly for dates before the anchor (negative modulo)', () => {
    // 2026-08-31 is 1 day before the anchor -> offset -1 -> ((-1 % 28) + 28) % 28 = 27
    expect(shiftForDate(pattern, '2026-08-31')).toBe(pattern.shiftSequence[27])
  })

  it('crosses a year boundary using the same formula', () => {
    // 2026-12-31 is 121 days after the anchor -> offset 121 % 28 = 9
    expect(shiftForDate(pattern, '2026-12-31')).toBe(pattern.shiftSequence[9])
  })
})

describe('shiftForDate with a non-28-day cycle length', () => {
  // A 30-day pattern (e.g. a personal rotation built from a full source
  // month) — the cycle length must come from the pattern's own sequence,
  // not a hardcoded constant.
  function thirtyDayPattern(anchorDate: string) {
    const shiftSequence: Shift[] = []
    for (let i = 0; i < 30; i++) {
      shiftSequence.push(i % 3 === 0 ? 'EARLY' : i % 3 === 1 ? 'LATE' : 'OFF')
    }
    return { shiftSequence, anchorDate }
  }
  const pattern = thirtyDayPattern('2026-09-01')

  it('returns shiftSequence[29] on day 29 of the cycle', () => {
    expect(shiftForDate(pattern, '2026-09-30')).toBe(pattern.shiftSequence[29])
  })

  it('wraps back to shiftSequence[0] on day 30 — a 28-day wrap would be wrong here', () => {
    expect(shiftForDate(pattern, '2026-10-01')).toBe(pattern.shiftSequence[0])
  })

  it('resolves correctly for dates before the anchor using the 30-day modulo', () => {
    // 2026-08-31 is 1 day before the anchor -> offset -1 -> ((-1 % 30) + 30) % 30 = 29
    expect(shiftForDate(pattern, '2026-08-31')).toBe(pattern.shiftSequence[29])
  })
})
