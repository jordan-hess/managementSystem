import { QUOTES, QUOTE_CATEGORIES, getQuoteOfTheDay } from './quotes'

// Africa/Johannesburg is UTC+2 year-round (no DST), so a SAST wall-clock
// time is always 2 hours behind the equivalent UTC instant.
function sast(day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 0, day, hour - 2, minute))
}

describe('QUOTES', () => {
  it('has at least 200 quotes with unique ids and text', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(200)
    expect(new Set(QUOTES.map(q => q.id)).size).toBe(QUOTES.length)
    expect(new Set(QUOTES.map(q => q.text.toLowerCase())).size).toBe(QUOTES.length)
  })

  it('only uses known categories', () => {
    for (const quote of QUOTES) expect(QUOTE_CATEGORIES).toContain(quote.category)
  })
})

describe('getQuoteOfTheDay', () => {
  it('stays the same across one business-local day', () => {
    expect(getQuoteOfTheDay(sast(10, 0, 0))).toEqual(getQuoteOfTheDay(sast(10, 23, 59)))
  })

  it('changes at SAST midnight, not UTC midnight', () => {
    // 23:30 SAST on the 10th is 21:30 UTC — still the 10th either way;
    // 01:00 SAST on the 11th is 23:00 UTC on the 10th.
    expect(getQuoteOfTheDay(sast(11, 1))).not.toEqual(getQuoteOfTheDay(sast(10, 23, 30)))
  })

  it('shows every quote once before repeating', () => {
    const seen = new Set<number>()
    for (let day = 1; day <= QUOTES.length; day++) seen.add(getQuoteOfTheDay(sast(day, 12)).id)
    expect(seen.size).toBe(QUOTES.length)
  })
})
