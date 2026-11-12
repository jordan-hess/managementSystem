export function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const BUSINESS_TIMEZONE = 'Africa/Johannesburg'

/** Resolves any instant to a local wall-clock Date matching its calendar day
 *  in the business's own timezone, regardless of what timezone the Node
 *  process itself is running in. The returned Date's local getters
 *  (getDay/getDate/getMonth/...) then always agree with the business's
 *  calendar, which is what getBusinessToday/getIsoDayOfWeek/getISOWeekStart
 *  below rely on. */
export function toBusinessLocalDate(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  const [y, m, d] = parts.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Returns "today" as a local Date, resolved in the business's own timezone
 *  regardless of what timezone the Node process itself is running in. */
export function getBusinessToday(): Date {
  return toBusinessLocalDate(new Date())
}

/** Minutes since midnight, resolved in the business's own timezone —
 *  lets shift start times ('HH:MM:SS', always business-local) be compared
 *  against a timestamptz regardless of what timezone the Node process or
 *  the viewer's browser is actually running in. */
export function getBusinessMinutesOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

/** ISO day-of-week in the business's own timezone: 1=Mon … 7=Sun.
 *  Previously read `date.getDay()` directly - correct only when the Node
 *  process's own timezone happens to match the business's, which isn't
 *  guaranteed in a container (2026-09-16 production-readiness audit,
 *  finding M7). Routed through toBusinessLocalDate like getBusinessToday. */
export function getIsoDayOfWeek(date: Date): number {
  const day = toBusinessLocalDate(date).getDay()   // 0=Sun
  return day === 0 ? 7 : day
}

/** Returns the Monday of the ISO week containing `date`, where "which week"
 *  is resolved in the business's own timezone - see getIsoDayOfWeek. */
export function getISOWeekStart(date: Date): Date {
  const d = toBusinessLocalDate(date)
  const day = d.getDay()   // 0=Sun
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

/** Returns 7 dates Mon–Sun for the week containing `date` */
export function getWeekDays(date: Date): Date[] {
  const monday = getISOWeekStart(date)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

/**
 * Returns all dates that appear in a monthly calendar grid (6 rows × 7 cols).
 * Includes leading/trailing days from adjacent months to fill the grid.
 */
export function getMonthGridDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1)

  const gridStart = getISOWeekStart(firstOfMonth)

  // Always produce exactly 6 rows (42 days) so the grid height is stable
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
}

/** The real calendar days (28-31) of a month — unlike getMonthGridDays,
 *  which pads to a fixed 42-day grid for the calendar view. */
export function getDaysInMonth(year: number, month: number): Date[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
}

/** Distinct ISO week Monday date-keys whose week overlaps the given month */
export function getWeeksInMonth(year: number, month: number): string[] {
  const days = getDaysInMonth(year, month)
  const weeks = new Set<string>()
  for (const day of days) {
    weeks.add(formatDateKey(getISOWeekStart(day)))
  }
  return [...weeks].sort()
}

/** Calendar-day range (1st through last day) of a single month — used for
 *  attendance_records/roster_overrides, which are keyed by literal date. */
export function getMonthRange(year: number, month: number): { from: string; to: string } {
  const from = new Date(year, month, 1)
  const to = new Date(year, month + 1, 0)
  return { from: formatDateKey(from), to: formatDateKey(to) }
}

/** First/last ISO week-Monday keys whose week overlaps the given month —
 *  the correct range for querying team_rotations, which is keyed by
 *  week_start_date rather than by day. Using the plain calendar-month range
 *  instead would drop a rotation whose week starts before the 1st but still
 *  covers the month's first few days (e.g. the month opening on a Thursday). */
export function getRotationWeekRange(year: number, month: number): { from: string; to: string } {
  const weeks = getWeeksInMonth(year, month)
  return { from: weeks[0], to: weeks[weeks.length - 1] }
}

/** 'YYYY-MM' key identifying a calendar month, for tracking which months'
 *  roster data has already been loaded into the client. */
export function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

/** Distinct month keys touched by a set of dates (e.g. a view's visible
 *  date range, which can span into an adjacent month at week/month-grid
 *  boundaries). */
export function getMonthKeysForDates(dates: Date[]): string[] {
  const keys = new Set<string>()
  for (const d of dates) keys.add(getMonthKey(d.getFullYear(), d.getMonth()))
  return [...keys].sort()
}

export function formatShiftTime(time: string): string {
  // time is 'HH:MM:SS' from Postgres
  const [h, m] = time.split(':')
  const hour = parseInt(h, 10)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${m} ${suffix}`
}

export function isSameMonth(date: Date, year: number, month: number): boolean {
  return date.getFullYear() === year && date.getMonth() === month
}

export function isToday(date: Date): boolean {
  const today = new Date()
  return formatDateKey(date) === formatDateKey(today)
}
