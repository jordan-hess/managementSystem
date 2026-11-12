// leadOps works in whole months, keyed by the first-of-month date ('YYYY-MM-01')
// — the shape efficiency_scores.period and manager_*.month store. Pure string
// maths over an ISO date the server passes in, so there is no clock read during
// render (no server/client mismatch near a month boundary).

/** First of the month for an ISO date ('2026-10-08' -> '2026-10-01'). */
export function currentMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`
}

/** The current month and the `count - 1` before it, newest first. */
export function recentMonths(isoDate: string, count = 12): string[] {
  let year = Number(isoDate.slice(0, 4))
  let month = Number(isoDate.slice(5, 7))
  const months: string[] = []
  for (let i = 0; i < count; i++) {
    months.push(`${year}-${String(month).padStart(2, '0')}-01`)
    month -= 1
    if (month === 0) { month = 12; year -= 1 }
  }
  return months
}

// ─── South African calendar dates and weeks ───────────────────────────────
//
// opsHub's team leaders work on South African time (UTC+2, no DST). A daily
// entry may only be changed "on the day", so the day is the South African one —
// not the server's UTC date, which is still yesterday between 00:00 and 02:00 SAST.

const DAY_MS = 86_400_000

function isoToMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Today's date in South Africa as 'YYYY-MM-DD'. Pass `new Date()`; tests pass a fixed instant. */
export function todayInSouthAfrica(now: Date): string {
  return msToIso(now.getTime() + 2 * 3_600_000)
}

/** True for a real calendar date written exactly as 'YYYY-MM-DD'. */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return msToIso(isoToMs(value)) === value
}

export function addDaysIso(iso: string, n: number): string {
  return msToIso(isoToMs(iso) + n * DAY_MS)
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((isoToMs(to) - isoToMs(from)) / DAY_MS)
}

export function isMonday(iso: string): boolean {
  return new Date(isoToMs(iso)).getUTCDay() === 1
}

/** The Monday of the ISO week containing `iso` (a Sunday belongs to the week before it). */
export function weekStartFor(iso: string): string {
  const dayOfWeek = new Date(isoToMs(iso)).getUTCDay() // 0 = Sunday
  return addDaysIso(iso, -((dayOfWeek + 6) % 7))
}

/** The current week's Monday and the `count - 1` before it, newest first. */
export function recentWeeks(iso: string, count = 12): string[] {
  const thisMonday = weekStartFor(iso)
  return Array.from({ length: count }, (_, i) => addDaysIso(thisMonday, -7 * i))
}

// ─── Time & Motion editing window ─────────────────────────────────────────

/** The South African hour (0–23) at `now`. */
export function hourInSouthAfrica(now: Date): number {
  return new Date(now.getTime() + 2 * 3_600_000).getUTCHours()
}

export type PlannerWindow = { editable: true } | { editable: false; reason: 'future' | 'closed' }

/**
 * A planner day can be changed on the day itself and — a grace period for late shifts that end
 * after midnight — until 12:00 the next day, South African time. Never a future day.
 */
export function plannerDayWindow(date: string, now: Date): PlannerWindow {
  const today = todayInSouthAfrica(now)
  if (date > today) return { editable: false, reason: 'future' }
  if (date === today) return { editable: true }
  if (date === addDaysIso(today, -1) && hourInSouthAfrica(now) < 12) return { editable: true }
  return { editable: false, reason: 'closed' }
}

export function plannerDayEditable(date: string, now: Date): boolean {
  return plannerDayWindow(date, now).editable
}
