import {
  addDaysIso, currentMonth, daysBetweenIso, hourInSouthAfrica, isMonday, isValidIsoDate,
  plannerDayEditable, plannerDayWindow, recentMonths, recentWeeks, todayInSouthAfrica, weekStartFor,
} from './periods'

describe('currentMonth', () => {
  it('returns the first of the month for an ISO date', () => {
    expect(currentMonth('2026-10-08')).toBe('2026-10-01')
    expect(currentMonth('2026-12-31')).toBe('2026-12-01')
  })
})

describe('recentMonths', () => {
  it('lists the current month and the previous ones, newest first, as first-of-month dates', () => {
    expect(recentMonths('2026-10-08', 4)).toEqual(['2026-10-01', '2026-09-01', '2026-08-01', '2026-07-01'])
  })

  it('crosses a year boundary', () => {
    expect(recentMonths('2027-02-15', 4)).toEqual(['2027-02-01', '2027-01-01', '2026-12-01', '2026-11-01'])
  })

  it('defaults to twelve months', () => {
    const months = recentMonths('2026-10-08')
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-10-01')
    expect(months[11]).toBe('2025-11-01')
  })
})

describe('todayInSouthAfrica', () => {
  it('is the UTC date until 22:00 UTC, then the next day (South Africa is UTC+2)', () => {
    expect(todayInSouthAfrica(new Date('2026-10-08T21:59:59Z'))).toBe('2026-10-08')
    expect(todayInSouthAfrica(new Date('2026-10-08T22:00:00Z'))).toBe('2026-10-09')
  })

  it('rolls over month and year ends', () => {
    expect(todayInSouthAfrica(new Date('2026-12-31T22:30:00Z'))).toBe('2027-01-01')
  })
})

describe('isValidIsoDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidIsoDate('2026-10-08')).toBe(true)
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('2026-1-5')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
    expect(isValidIsoDate('not-a-date')).toBe(false)
  })
})

describe('addDaysIso / daysBetweenIso', () => {
  it('adds and subtracts days across month ends', () => {
    expect(addDaysIso('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts whole days between two dates', () => {
    expect(daysBetweenIso('2026-10-01', '2026-10-08')).toBe(7)
    expect(daysBetweenIso('2026-10-08', '2026-10-08')).toBe(0)
  })
})

describe('isMonday / weekStartFor', () => {
  it('knows which dates are Mondays (2026-10-05 is one)', () => {
    expect(isMonday('2026-10-05')).toBe(true)
    expect(isMonday('2026-10-06')).toBe(false)
  })

  it('returns the Monday of the week for any day, including Sunday', () => {
    expect(weekStartFor('2026-10-05')).toBe('2026-10-05')
    expect(weekStartFor('2026-10-08')).toBe('2026-10-05')
    expect(weekStartFor('2026-10-11')).toBe('2026-10-05')
    expect(weekStartFor('2026-10-12')).toBe('2026-10-12')
  })
})

describe('recentWeeks', () => {
  it('lists the current week\'s Monday and the ones before it, newest first', () => {
    expect(recentWeeks('2026-10-08', 3)).toEqual(['2026-10-05', '2026-09-28', '2026-09-21'])
  })

  it('defaults to twelve Mondays ending 77 days before the current one', () => {
    const weeks = recentWeeks('2026-10-08')
    expect(weeks).toHaveLength(12)
    expect(weeks[0]).toBe('2026-10-05')
    expect(weeks[11]).toBe('2026-07-20')
  })
})

describe('plannerDayWindow', () => {
  // SA = UTC+2. 2026-10-08T09:59Z is 11:59 on 8 Oct in South Africa; 10:00Z is 12:00.
  const at = (iso: string) => new Date(iso)

  it('allows today', () => {
    expect(plannerDayWindow('2026-10-08', at('2026-10-08T15:00:00Z'))).toEqual({ editable: true })
  })
  it('allows yesterday until 12:00 SA the next day: 11:59 yes, 12:00 no', () => {
    expect(plannerDayWindow('2026-10-07', at('2026-10-08T09:59:00Z'))).toEqual({ editable: true })
    expect(plannerDayWindow('2026-10-07', at('2026-10-08T10:00:00Z'))).toEqual({ editable: false, reason: 'closed' })
  })
  it('refuses tomorrow as a day that has not started', () => {
    expect(plannerDayWindow('2026-10-09', at('2026-10-08T10:00:00Z'))).toEqual({ editable: false, reason: 'future' })
  })
  it('refuses two days ago', () => {
    expect(plannerDayWindow('2026-10-06', at('2026-10-08T01:00:00Z'))).toEqual({ editable: false, reason: 'closed' })
  })
  it('follows the South African date across midnight: at 00:30 SA on 9 Oct, 8 Oct is still editable and 7 Oct is not', () => {
    const now = at('2026-10-08T22:30:00Z')
    expect(plannerDayWindow('2026-10-08', now)).toEqual({ editable: true })
    expect(plannerDayWindow('2026-10-09', now)).toEqual({ editable: true })
    expect(plannerDayWindow('2026-10-07', now)).toEqual({ editable: false, reason: 'closed' })
  })
  it('plannerDayEditable is the boolean form; hourInSouthAfrica reads the SA hour', () => {
    expect(plannerDayEditable('2026-10-08', at('2026-10-08T10:00:00Z'))).toBe(true)
    expect(hourInSouthAfrica(at('2026-10-08T22:30:00Z'))).toBe(0)
  })
})
