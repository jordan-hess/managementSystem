import { getBusinessMinutesOfDay } from '@/lib/roster/calendarUtils'

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening'

/**
 * Business-local (Africa/Johannesburg) time-of-day for the Home page
 * greeting. The morning window starts at 05:00, not midnight — this is a
 * 24/7 contact centre, and a night-shift agent logging in at 02:00 should
 * see "Good evening", not "Good morning".
 */
export function getGreetingPeriod(now: Date = new Date()): GreetingPeriod {
  const minutes = getBusinessMinutesOfDay(now)
  if (minutes >= 300 && minutes < 720) return 'morning'
  if (minutes >= 720 && minutes < 1020) return 'afternoon'
  return 'evening'
}
