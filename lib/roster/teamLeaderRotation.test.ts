/**
 * Regression cover for the team-leader rotation, validated against the two
 * real rosters supplied by the business (September and October 2026).
 *
 * These are the sequences that Database/migrations/
 * fix-tl-rotation-to-28-day-cycle-2026-09-23.sql writes into
 * roster_rotation_patterns E/F/G/I. Keeping a copy here is what makes the
 * bug they fix testable: the previous patterns were 30 days long (a whole
 * calendar month) for a rotation that actually repeats every 28, so the
 * roster drifted 2 days per cycle and every month after the source month
 * was wrong. Nothing in the engine changed — shiftForDate already handled
 * any cycle length — so the only way to catch a regression here is to
 * assert the DATA against the real rosters.
 *
 * If these sequences are ever edited, the migration must be edited to
 * match (and vice versa) or the app and the database disagree silently.
 */

import { shiftForDate, type RotationPattern, type Shift } from './rotationEngine'

const ANCHOR = '2026-10-01'

function pattern(seq: string): RotationPattern {
  return { shiftSequence: seq.split(',') as Shift[], anchorDate: ANCHOR }
}

const PATTERNS: Record<string, RotationPattern> = {
  // E
  Taylor: pattern(
    'EARLY,EARLY,OFF,OFF,EARLY,LATE,LATE,LATE,LATE,OFF,OFF,EARLY,EARLY,EARLY,OFF,OFF,LATE,LATE,LATE,OFF,OFF,EARLY,EARLY,EARLY,EARLY,EARLY,OFF,EARLY',
  ),
  // F
  Jamie: pattern(
    'LATE,LATE,OFF,OFF,LATE,EARLY,EARLY,OFF,OFF,LATE,LATE,LATE,OFF,OFF,EARLY,EARLY,EARLY,EARLY,EARLY,OFF,EARLY,EARLY,EARLY,EARLY,OFF,EARLY,LATE,LATE',
  ),
  // G
  Casey: pattern(
    'OFF,OFF,LATE,LATE,LATE,EARLY,EARLY,EARLY,OFF,OFF,EARLY,EARLY,OFF,EARLY,EARLY,EARLY,EARLY,OFF,EARLY,LATE,LATE,LATE,LATE,OFF,OFF,EARLY,EARLY,EARLY',
  ),
  // I
  Riley: pattern(
    'EARLY,EARLY,EARLY,EARLY,EARLY,OFF,EARLY,EARLY,EARLY,EARLY,OFF,EARLY,LATE,LATE,LATE,LATE,OFF,OFF,EARLY,EARLY,EARLY,OFF,OFF,LATE,LATE,LATE,OFF,OFF',
  ),
}

/** The business rosters use clock times; the engine uses shift names. */
const SHIFT_TO_TIME: Record<Shift, string> = { EARLY: '8:00', LATE: '11:00', OFF: 'OFF' }

function render(name: keyof typeof PATTERNS, year: number, month: number, days: number): string[] {
  const out: string[] = []
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    out.push(SHIFT_TO_TIME[shiftForDate(PATTERNS[name], date)])
  }
  return out
}

const csv = (s: string) => s.split(',')

// ── The real October 2026 roster, verbatim from the supplied CSV ──────────
const OCTOBER: Record<string, string[]> = {
  Taylor: csv('8:00,8:00,OFF,OFF,8:00,11:00,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00,OFF,OFF,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00,8:00,8:00,OFF,8:00,8:00,8:00,OFF'),
  Jamie: csv('11:00,11:00,OFF,OFF,11:00,8:00,8:00,OFF,OFF,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00,8:00,8:00,OFF,8:00,8:00,8:00,8:00,OFF,8:00,11:00,11:00,11:00,11:00,OFF'),
  Casey: csv('OFF,OFF,11:00,11:00,11:00,8:00,8:00,8:00,OFF,OFF,8:00,8:00,OFF,8:00,8:00,8:00,8:00,OFF,8:00,11:00,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00,OFF,OFF,11:00'),
  Riley: csv('8:00,8:00,8:00,8:00,8:00,OFF,8:00,8:00,8:00,8:00,OFF,8:00,11:00,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00,OFF,OFF,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00'),
}

// ── The real September 2026 PLANNED roster (the clean table, no SL/AL) ────
const SEPTEMBER: Record<string, string[]> = {
  Taylor: csv('8:00,8:00,8:00,8:00,OFF,OFF,8:00,11:00,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00,OFF,OFF,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00,8:00,8:00,OFF,8:00'),
  Jamie: csv('11:00,11:00,11:00,11:00,OFF,OFF,11:00,8:00,8:00,OFF,OFF,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00,8:00,8:00,OFF,8:00,8:00,8:00,8:00,OFF,8:00,11:00,11:00'),
  Casey: csv('8:00,8:00,OFF,OFF,11:00,11:00,11:00,8:00,8:00,8:00,OFF,OFF,8:00,OFF,8:00,8:00,8:00,8:00,8:00,OFF,8:00,11:00,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00'),
  Riley: csv('OFF,OFF,8:00,8:00,8:00,8:00,OFF,8:00,8:00,8:00,8:00,8:00,OFF,8:00,11:00,11:00,11:00,11:00,OFF,OFF,8:00,8:00,8:00,OFF,OFF,11:00,11:00,11:00,OFF,OFF'),
}

/**
 * The days in September where the real roster departs from the rotation.
 * These are manual adjustments, not rotation: the rotation is what October
 * shows, and these are what someone did to it. Once roster_overrides
 * carries them the roster will render them; the underlying pattern must NOT
 * be bent to absorb them.
 *
 *  - Casey 14<->15 and Riley 7<->8 are swaps: an OFF and an 8:00 traded
 *    places on two consecutive days.
 *  - Taylor 1 is a single extra shift — the rotation has her OFF, the roster
 *    has her on 8:00. The attendance export shows her on SL for the 2nd to
 *    the 4th, so she worked the 1st and then went off sick.
 *
 * Jamie has none: her September matches the rotation on all 30 days.
 */
const SEPTEMBER_EXCEPTIONS: Record<string, number[]> = {
  Taylor: [1],
  Jamie: [],
  Casey: [14, 15],
  Riley: [7, 8],
}

const NAMES = ['Taylor', 'Jamie', 'Casey', 'Riley'] as const

describe('team-leader rotation — October 2026 (the source roster)', () => {
  it.each(NAMES)('reproduces %s’s October roster exactly', (name) => {
    expect(render(name, 2026, 10, 31)).toEqual(OCTOBER[name])
  })
})

describe('team-leader rotation — September 2026 (the month before)', () => {
  it.each(NAMES)('reproduces %s’s September roster on every non-exception day', (name) => {
    const generated = render(name, 2026, 9, 30)
    const expected = [...SEPTEMBER[name]]
    // Mask the manually-adjusted days so the assertion covers the rest.
    for (const day of SEPTEMBER_EXCEPTIONS[name]) {
      generated[day - 1] = 'EXCEPTION'
      expected[day - 1] = 'EXCEPTION'
    }
    expect(generated).toEqual(expected)
  })

  it('reproduces Jamie’s September with no exceptions at all', () => {
    expect(SEPTEMBER_EXCEPTIONS.Jamie).toEqual([])
    expect(render('Jamie', 2026, 9, 30)).toEqual(SEPTEMBER.Jamie)
  })

  it('leaves at most 2 of 30 days as manual adjustments per leader', () => {
    for (const name of NAMES) {
      expect(SEPTEMBER_EXCEPTIONS[name].length).toBeLessThanOrEqual(2)
    }
  })

  it('classifies each exception as a same-day swap or an extra shift', () => {
    for (const name of NAMES) {
      const days = SEPTEMBER_EXCEPTIONS[name]
      if (days.length === 2) {
        // A swap: adjacent days, one OFF traded for one 8:00.
        expect(days[1] - days[0]).toBe(1)
        expect(days.map((d) => SEPTEMBER[name][d - 1]).sort()).toEqual(['8:00', 'OFF'])
      } else if (days.length === 1) {
        // An extra shift: the rotation says OFF, the roster says worked.
        const day = days[0]
        expect(shiftForDate(PATTERNS[name], `2026-09-${String(day).padStart(2, '0')}`)).toBe('OFF')
        expect(SEPTEMBER[name][day - 1]).not.toBe('OFF')
      }
    }
  })
})

describe('the rotation does not reset at a month boundary', () => {
  it('runs straight through 30 Sept into 1 Oct', () => {
    // 30 Sept is cycle index 27, 1 Oct is index 0 — the wrap, not a reset.
    expect(render('Taylor', 2026, 9, 30)[29]).toBe('8:00')
    expect(shiftForDate(PATTERNS.Taylor, '2026-10-01')).toBe('EARLY')
    expect(shiftForDate(PATTERNS.Casey, '2026-09-30')).toBe('EARLY')
    expect(shiftForDate(PATTERNS.Casey, '2026-10-01')).toBe('OFF')
  })

  it('runs straight through 31 Oct into 1 Nov, despite a 31-day month', () => {
    // Oct has 31 days but the cycle is 28, so 1 Nov is index 31 % 28 = 3.
    for (const name of NAMES) {
      expect(shiftForDate(PATTERNS[name], '2026-11-01')).toBe(PATTERNS[name].shiftSequence[3])
    }
  })

  it('is unaffected by month length or starting weekday', () => {
    // Feb 2027 (28 days), Mar 2027 (31, different starting weekday) and a
    // leap day: the cycle index depends only on days elapsed since the
    // anchor, never on where a month happens to begin or end.
    for (const name of NAMES) {
      for (const date of ['2027-02-01', '2027-02-28', '2027-03-01', '2028-02-29']) {
        const [y, m, d] = date.split('-').map(Number)
        const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 9, 1)) / 86400000)
        const i = ((days % 28) + 28) % 28
        expect(shiftForDate(PATTERNS[name], date)).toBe(PATTERNS[name].shiftSequence[i])
      }
    }
  })

  it('repeats every 28 days, arbitrarily far out', () => {
    // 364 days = 13 whole cycles, so the shift must be identical.
    for (const name of NAMES) {
      expect(shiftForDate(PATTERNS[name], '2027-10-06')).toBe(
        shiftForDate(PATTERNS[name], '2026-10-07'),
      )
    }
  })

  it('does not line up year-on-year, because 365 is not a multiple of 28', () => {
    // 365 % 28 = 1, so the same calendar date one year later sits one index
    // further along. This is why the roster can only be reasoned about in
    // elapsed days — the 30-day patterns failed by assuming months line up.
    for (const name of NAMES) {
      const seq = PATTERNS[name].shiftSequence
      const oct7 = 6 // days since 2026-10-01
      expect(shiftForDate(PATTERNS[name], '2027-10-07')).toBe(seq[(oct7 + 365) % 28])
    }
  })
})

describe('shape of the corrected patterns', () => {
  it('is 28 days for every leader — not the 30 that caused the drift', () => {
    for (const name of NAMES) expect(PATTERNS[name].shiftSequence).toHaveLength(28)
  })

  it('keeps staggered cover: every day has an early, and exactly one late', () => {
    for (let i = 0; i < 28; i++) {
      const day = NAMES.map((n) => PATTERNS[n].shiftSequence[i])
      expect(day.filter((s) => s === 'EARLY').length).toBeGreaterThanOrEqual(1)
      // Index 4 is the one day in the cycle that carries two late shifts.
      expect(day.filter((s) => s === 'LATE').length).toBe(i === 4 ? 2 : 1)
    }
  })

  it('gives every leader a comparable workload', () => {
    for (const name of NAMES) {
      const worked = PATTERNS[name].shiftSequence.filter((s) => s !== 'OFF').length
      expect(worked).toBeGreaterThanOrEqual(19)
      expect(worked).toBeLessThanOrEqual(20)
    }
  })
})

describe('the old 30-day patterns would have failed this', () => {
  it('drifts 2 days per cycle when the cycle length is wrong', () => {
    // The regression in one line: a 30-long sequence anchored at the same
    // date returns a different shift for the same day, one cycle on.
    const thirty: RotationPattern = {
      shiftSequence: [...PATTERNS.Taylor.shiftSequence, 'OFF', 'OFF'] as Shift[],
      anchorDate: ANCHOR,
    }
    expect(thirty.shiftSequence).toHaveLength(30)
    expect(shiftForDate(thirty, '2026-10-31')).not.toBe(shiftForDate(PATTERNS.Taylor, '2026-10-31'))
  })
})
