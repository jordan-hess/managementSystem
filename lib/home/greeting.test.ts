import { getGreetingPeriod } from './greeting'

// Africa/Johannesburg is UTC+2 year-round (no DST), so a SAST wall-clock
// time is always 2 hours behind the equivalent UTC instant.
function sast(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 0, 1, hour - 2, minute))
}

describe('getGreetingPeriod', () => {
  it('is evening just before the morning boundary (04:59)', () => {
    expect(getGreetingPeriod(sast(4, 59))).toBe('evening')
  })

  it('is morning at the morning boundary (05:00)', () => {
    expect(getGreetingPeriod(sast(5, 0))).toBe('morning')
  })

  it('is morning just before the afternoon boundary (11:59)', () => {
    expect(getGreetingPeriod(sast(11, 59))).toBe('morning')
  })

  it('is afternoon at the afternoon boundary (12:00)', () => {
    expect(getGreetingPeriod(sast(12, 0))).toBe('afternoon')
  })

  it('is afternoon just before the evening boundary (16:59)', () => {
    expect(getGreetingPeriod(sast(16, 59))).toBe('afternoon')
  })

  it('is evening at the evening boundary (17:00)', () => {
    expect(getGreetingPeriod(sast(17, 0))).toBe('evening')
  })

  it('is evening for a night-shift login (02:00), not morning', () => {
    expect(getGreetingPeriod(sast(2, 0))).toBe('evening')
  })
})
