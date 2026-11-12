import { sql } from '@/lib/db/pool'
import { ReportFilters } from './filters'
import { toExclusiveDate } from './dateRanges'
import { socialStatusFragment, socialChannelFragment, socialIssueTypeFragment, socialRootCauseFragment } from './fragments'
import { BreakdownRow, QueueBreakdownData } from './t2QueueBreakdown'

type SocialBreakdownColumn = 'issue_type' | 'root_cause'
interface RawRow { value: string | null; volume: string }

/** Social's sibling of t2QueueBreakdown.ts's groupByColumn — no per-queue branching, since Social has exactly one issue_type/root_cause pair, not one set per channel. */
async function groupByColumn(column: SocialBreakdownColumn, filters: ReportFilters): Promise<BreakdownRow[]> {
  const toExclusive = toExclusiveDate(filters.to)

  const rows = await sql<RawRow[]>`
    SELECT COALESCE(st.${sql(column)}, 'Unspecified') AS value, COUNT(*) AS volume
    FROM support_tickets st
    WHERE st.created_at >= ${filters.from}::timestamptz AND st.created_at < ${toExclusive}::timestamptz
      ${socialChannelFragment(filters)} ${socialStatusFragment(filters)} ${socialIssueTypeFragment(filters)} ${socialRootCauseFragment(filters)}
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

export const getSocialIssueTypeBreakdown = (filters: ReportFilters) => groupByColumn('issue_type', filters)
export const getSocialRootCauseBreakdown = (filters: ReportFilters) => groupByColumn('root_cause', filters)

/** Composes both breakdown queries — the single call site the Social breakdown card's data comes from. */
export async function getSocialBreakdownData(filters: ReportFilters): Promise<QueueBreakdownData> {
  const [issueType, rootCause] = await Promise.all([getSocialIssueTypeBreakdown(filters), getSocialRootCauseBreakdown(filters)])
  return { primary: { label: 'Issue Type', rows: issueType }, secondary: { label: 'Root Cause', rows: rootCause } }
}
