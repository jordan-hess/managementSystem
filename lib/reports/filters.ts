// Management Reporting Dashboard — shared filter contract every lib/reports/*
// query function takes. `from`/`to` are always resolved server-side before
// reaching a query (see dateRanges.ts's resolvePeriod) — never optional here.
export interface ReportFilters {
  from: string   // 'YYYY-MM-DD', inclusive
  to: string      // 'YYYY-MM-DD', inclusive
  team: 'all' | 't2' | 'social'
  queue?: string  // one of lib/t2/constants.ts's QUEUES, or lib/queues/constants.ts's SOCIAL_QUEUES
  issueType?: string
  rootCause?: string
  status: 'all' | 'open' | 'resolved' | 'escalated'
}

export interface DeltaMetric {
  current: number
  previous: number
  /** null when previous === 0 — render "New"/"—" instead of a percentage. */
  deltaPct: number | null
}

export function computeDelta(current: number, previous: number): DeltaMetric {
  const deltaPct = previous === 0 ? null : ((current - previous) / previous) * 100
  return { current, previous, deltaPct }
}
