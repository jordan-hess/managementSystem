import { sql } from '@/lib/db/pool'
import { QUEUES } from '@/lib/t2/constants'
import { ReportFilters, DeltaMetric, computeDelta } from './filters'
import { previousEquivalentPeriod, toExclusiveDate } from './dateRanges'
import {
  t2QueueFragment, socialChannelFragment, t2IssueTypeFragment, t2RootCauseFragment,
  socialIssueTypeFragment, socialRootCauseFragment,
  t2StatusFragment, socialStatusFragment,
  T2_OPEN_STATUSES, T2_RESOLVED_STATUSES, T2_ESCALATED_STATUSES,
  SOCIAL_OPEN_STATUSES, SOCIAL_RESOLVED_STATUSES, SOCIAL_ESCALATED_STATUSES,
} from './fragments'

export interface KpiSummary {
  totalTickets: DeltaMetric
  t2Ops: DeltaMetric
  social: DeltaMetric
  open: DeltaMetric
  resolved: DeltaMetric
  escalated: DeltaMetric
}

interface RawRow {
  t2_current_total: string; t2_previous_total: string
  t2_current_open: string; t2_current_resolved: string; t2_current_escalated: string
  t2_previous_open: string; t2_previous_resolved: string; t2_previous_escalated: string
  social_current_total: string; social_previous_total: string
  social_current_open: string; social_current_resolved: string; social_current_escalated: string
  social_previous_open: string; social_previous_resolved: string; social_previous_escalated: string
}

/**
 * All 6 KPI cards' current + previous-equivalent-period figures in one
 * round trip. Both source tables are scanned once each, bounded to the
 * continuous [previousFrom, currentToExclusive) range (the current and
 * previous windows are contiguous — see dateRanges.ts), with
 * COUNT(*) FILTER (WHERE ...) splitting current vs previous and status
 * bucket per column instead of separate queries per metric.
 */
export async function getKpiSummary(filters: ReportFilters): Promise<KpiSummary> {
  const { from: prevFrom, to: prevTo } = previousEquivalentPeriod(filters.from, filters.to)
  const curFrom = filters.from
  const curToExclusive = toExclusiveDate(filters.to)
  const prevToExclusive = toExclusiveDate(prevTo)

  const [row] = await sql<RawRow[]>`
    WITH t2 AS (
      SELECT
        COUNT(*) FILTER (WHERE t.created_at::timestamp >= ${curFrom}::timestamp AND t.created_at::timestamp < ${curToExclusive}::timestamp) AS current_total,
        COUNT(*) FILTER (WHERE t.created_at::timestamp >= ${prevFrom}::timestamp AND t.created_at::timestamp < ${prevToExclusive}::timestamp) AS previous_total,
        COUNT(*) FILTER (WHERE t.created_at::timestamp >= ${curFrom}::timestamp AND t.created_at::timestamp < ${curToExclusive}::timestamp AND t.status = ANY(${T2_OPEN_STATUSES})) AS current_open,
        COUNT(*) FILTER (WHERE t.created_at::timestamp >= ${curFrom}::timestamp AND t.created_at::timestamp < ${curToExclusive}::timestamp AND t.status = ANY(${T2_RESOLVED_STATUSES})) AS current_resolved,
        COUNT(*) FILTER (WHERE t.created_at::timestamp >= ${curFrom}::timestamp AND t.created_at::timestamp < ${curToExclusive}::timestamp AND t.status = ANY(${T2_ESCALATED_STATUSES})) AS current_escalated,
        COUNT(*) FILTER (WHERE t.created_at::timestamp >= ${prevFrom}::timestamp AND t.created_at::timestamp < ${prevToExclusive}::timestamp AND t.status = ANY(${T2_OPEN_STATUSES})) AS previous_open,
        COUNT(*) FILTER (WHERE t.created_at::timestamp >= ${prevFrom}::timestamp AND t.created_at::timestamp < ${prevToExclusive}::timestamp AND t.status = ANY(${T2_RESOLVED_STATUSES})) AS previous_resolved,
        COUNT(*) FILTER (WHERE t.created_at::timestamp >= ${prevFrom}::timestamp AND t.created_at::timestamp < ${prevToExclusive}::timestamp AND t.status = ANY(${T2_ESCALATED_STATUSES})) AS previous_escalated
      FROM tickets t
      WHERE t.created_at::timestamp >= ${prevFrom}::timestamp AND t.created_at::timestamp < ${curToExclusive}::timestamp
        AND t.queue = ANY(${QUEUES as unknown as string[]})
        ${t2QueueFragment(filters)} ${t2IssueTypeFragment(filters)} ${t2RootCauseFragment(filters)} ${t2StatusFragment(filters)}
    ),
    social AS (
      SELECT
        COUNT(*) FILTER (WHERE st.created_at >= ${curFrom}::timestamptz AND st.created_at < ${curToExclusive}::timestamptz) AS current_total,
        COUNT(*) FILTER (WHERE st.created_at >= ${prevFrom}::timestamptz AND st.created_at < ${prevToExclusive}::timestamptz) AS previous_total,
        COUNT(*) FILTER (WHERE st.created_at >= ${curFrom}::timestamptz AND st.created_at < ${curToExclusive}::timestamptz AND st.status = ANY(${SOCIAL_OPEN_STATUSES})) AS current_open,
        COUNT(*) FILTER (WHERE st.created_at >= ${curFrom}::timestamptz AND st.created_at < ${curToExclusive}::timestamptz AND st.status = ANY(${SOCIAL_RESOLVED_STATUSES})) AS current_resolved,
        COUNT(*) FILTER (WHERE st.created_at >= ${curFrom}::timestamptz AND st.created_at < ${curToExclusive}::timestamptz AND st.status = ANY(${SOCIAL_ESCALATED_STATUSES})) AS current_escalated,
        COUNT(*) FILTER (WHERE st.created_at >= ${prevFrom}::timestamptz AND st.created_at < ${prevToExclusive}::timestamptz AND st.status = ANY(${SOCIAL_OPEN_STATUSES})) AS previous_open,
        COUNT(*) FILTER (WHERE st.created_at >= ${prevFrom}::timestamptz AND st.created_at < ${prevToExclusive}::timestamptz AND st.status = ANY(${SOCIAL_RESOLVED_STATUSES})) AS previous_resolved,
        COUNT(*) FILTER (WHERE st.created_at >= ${prevFrom}::timestamptz AND st.created_at < ${prevToExclusive}::timestamptz AND st.status = ANY(${SOCIAL_ESCALATED_STATUSES})) AS previous_escalated
      FROM support_tickets st
      WHERE st.created_at >= ${prevFrom}::timestamptz AND st.created_at < ${curToExclusive}::timestamptz
        ${socialChannelFragment(filters)} ${socialStatusFragment(filters)} ${socialIssueTypeFragment(filters)} ${socialRootCauseFragment(filters)}
    )
    SELECT
      t2.current_total AS t2_current_total, t2.previous_total AS t2_previous_total,
      t2.current_open AS t2_current_open, t2.current_resolved AS t2_current_resolved, t2.current_escalated AS t2_current_escalated,
      t2.previous_open AS t2_previous_open, t2.previous_resolved AS t2_previous_resolved, t2.previous_escalated AS t2_previous_escalated,
      social.current_total AS social_current_total, social.previous_total AS social_previous_total,
      social.current_open AS social_current_open, social.current_resolved AS social_current_resolved, social.current_escalated AS social_current_escalated,
      social.previous_open AS social_previous_open, social.previous_resolved AS social_previous_resolved, social.previous_escalated AS social_previous_escalated
    FROM t2, social
  `

  const n = (v: string) => Number(v)

  return {
    totalTickets: computeDelta(n(row.t2_current_total) + n(row.social_current_total), n(row.t2_previous_total) + n(row.social_previous_total)),
    t2Ops: computeDelta(n(row.t2_current_total), n(row.t2_previous_total)),
    social: computeDelta(n(row.social_current_total), n(row.social_previous_total)),
    open: computeDelta(n(row.t2_current_open) + n(row.social_current_open), n(row.t2_previous_open) + n(row.social_previous_open)),
    resolved: computeDelta(n(row.t2_current_resolved) + n(row.social_current_resolved), n(row.t2_previous_resolved) + n(row.social_previous_resolved)),
    escalated: computeDelta(n(row.t2_current_escalated) + n(row.social_current_escalated), n(row.t2_previous_escalated) + n(row.social_previous_escalated)),
  }
}
