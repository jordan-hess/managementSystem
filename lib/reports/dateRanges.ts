import { formatDateKey, getBusinessToday } from '@/lib/roster/calendarUtils'

const DEFAULT_PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

/** Resolves the header's period-preset/custom-range controls into a concrete inclusive [from, to] date pair. */
export function resolvePeriod(period: string | undefined, from: string | undefined, to: string | undefined): { from: string; to: string } {
  if (period === 'custom' && from && to) return { from, to }

  const days = DEFAULT_PERIOD_DAYS[period ?? '30d'] ?? 30
  const toDate = getBusinessToday()
  const fromDate = new Date(toDate)
  fromDate.setDate(fromDate.getDate() - (days - 1))
  return { from: formatDateKey(fromDate), to: formatDateKey(toDate) }
}

/** The immediately preceding period of the same length — powers every KPI's vs-previous-period delta. */
export function previousEquivalentPeriod(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(`${from}T00:00:00`)
  const toDate = new Date(`${to}T00:00:00`)
  const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1

  const prevTo = new Date(fromDate)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (spanDays - 1))

  return { from: formatDateKey(prevFrom), to: formatDateKey(prevTo) }
}

/** The exclusive upper bound (the day after `to`) every SQL range comparison below uses instead of a `<=` on `to`. */
export function toExclusiveDate(to: string): string {
  const d = new Date(`${to}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return formatDateKey(d)
}
