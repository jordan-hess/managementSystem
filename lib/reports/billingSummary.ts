import { sql } from '@/lib/db/pool'
import { toExclusiveDate } from './dateRanges'
import { T2_RESOLVED_STATUSES } from './fragments'

// Billing tickets use their own simple 3-state flow — every ticket starts
// 'escalated' (there's no 'open' status), then moves to either 'follow_up'
// or 'resolved' (see BillingStatusModal.tsx / createBillingTicketAction).
// "Open" here means "still needs work": escalated + follow_up. Deliberately
// NOT T2_OPEN_STATUSES (a different state machine entirely, and that list
// excludes 'escalated' on purpose since T2 tracks it as its own KPI bucket).
const BILLING_OPEN_STATUSES = ['escalated', 'follow_up']

// Billing is a 5th T2 queue but deliberately NOT threaded through
// ReportFilters' team/queue/issueType/rootCause/status machinery — it isn't
// part of the existing filter bar and has no queue-varying sub-structure, so
// this module takes a plain date range instead of the shared ReportFilters
// shape used by every other lib/reports/* query.
export interface BillingDateRange {
  from: string
  to: string
}

export interface BillingSummary {
  volume: number
  open: number
  completed: number
}

/** Volume/open/completed counts for the BILLING queue over a plain date range. "Completed" reuses T2_RESOLVED_STATUSES; "open" uses Billing's own BILLING_OPEN_STATUSES (see above). */
export async function getBillingSummary(range: BillingDateRange): Promise<BillingSummary> {
  const toExclusive = toExclusiveDate(range.to)
  const [row] = await sql<{ volume: string; open: string; completed: string }[]>`
    SELECT
      COUNT(*) AS volume,
      COUNT(*) FILTER (WHERE status = ANY(${BILLING_OPEN_STATUSES})) AS open,
      COUNT(*) FILTER (WHERE status = ANY(${T2_RESOLVED_STATUSES})) AS completed
    FROM tickets
    WHERE queue = 'BILLING'
      AND created_at::timestamp >= ${range.from}::timestamp AND created_at::timestamp < ${toExclusive}::timestamp
  `
  return { volume: Number(row.volume), open: Number(row.open), completed: Number(row.completed) }
}

// Same {value, volume, pct} shape as t2QueueBreakdown.ts's BreakdownRow —
// intentionally not imported from there (Billing's reporting module stays
// standalone), but kept structurally identical so BreakdownTable (typed
// against BreakdownRow) accepts these rows without a cast.
export interface BillingBreakdownRow {
  value: string
  volume: number
  pct: number
}

interface RawRow {
  value: string | null
  volume: string
}

/** One GROUP BY <column> query for the BILLING queue; pct computed in JS over the small result. NULLs group as 'Unspecified'. */
async function groupBy(column: 'issue_type' | 'channel', range: BillingDateRange): Promise<BillingBreakdownRow[]> {
  const toExclusive = toExclusiveDate(range.to)
  const rows = await sql<RawRow[]>`
    SELECT COALESCE(${sql(column)}, 'Unspecified') AS value, COUNT(*) AS volume
    FROM tickets
    WHERE queue = 'BILLING'
      AND created_at::timestamp >= ${range.from}::timestamp AND created_at::timestamp < ${toExclusive}::timestamp
    GROUP BY 1
    ORDER BY volume DESC
  `
  const total = rows.reduce((sum, r) => sum + Number(r.volume), 0)
  return rows.map((r) => ({
    value: r.value ?? 'Unspecified',
    volume: Number(r.volume),
    pct: total === 0 ? 0 : (Number(r.volume) / total) * 100,
  }))
}

// issue_type is reused for Billing's "reason for follow-up" classification
// (see Task 3/createBillingTicketAction), not a separate column.
export const getBillingReasonBreakdown = (range: BillingDateRange) => groupBy('issue_type', range)
export const getBillingChannelBreakdown = (range: BillingDateRange) => groupBy('channel', range)
