import { sql } from '@/lib/db/pool'
import { ReportFilters } from './filters'
import { toExclusiveDate } from './dateRanges'
import { t2StatusFragment, t2IssueTypeFragment, t2RootCauseFragment } from './fragments'

export interface BreakdownRow {
  value: string
  volume: number
  pct: number
}

interface RawRow { value: string | null; volume: string }

// The 5 columns this feature ever breaks down by — always one of these
// literals, passed by the named wrappers below, never from request input.
// sql() interpolates the column name as an identifier, so there is no
// injection surface as long as callers only reach it through this union.
type BreakdownColumn = 'issue_type' | 'root_cause' | 'sim_type' | 'swap_reason' | 'port_issue_type'

/** One GROUP BY <column> query for a single T2 queue; pct computed in JS over the small result. NULLs group as 'Unspecified'. */
async function groupByColumn(column: BreakdownColumn, queue: string, filters: ReportFilters): Promise<BreakdownRow[]> {
  const toExclusive = toExclusiveDate(filters.to)

  const rows = await sql<RawRow[]>`
    SELECT COALESCE(t.${sql(column)}, 'Unspecified') AS value, COUNT(*) AS volume
    FROM tickets t
    WHERE t.created_at::timestamp >= ${filters.from}::timestamp AND t.created_at::timestamp < ${toExclusive}::timestamp
      AND t.queue = ${queue}
      ${t2StatusFragment(filters)} ${t2IssueTypeFragment(filters)} ${t2RootCauseFragment(filters)}
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

export const getAdvancedIssueTypeBreakdown = (filters: ReportFilters) => groupByColumn('issue_type', 'ADVANCED', filters)
export const getAdvancedRootCauseBreakdown = (filters: ReportFilters) => groupByColumn('root_cause', 'ADVANCED', filters)
export const getVoiceIssueTypeBreakdown = (filters: ReportFilters) => groupByColumn('issue_type', 'VOICE', filters)
export const getVoiceRootCauseBreakdown = (filters: ReportFilters) => groupByColumn('root_cause', 'VOICE', filters)
export const getSimSwapTypeBreakdown = (filters: ReportFilters) => groupByColumn('sim_type', 'SIM SWAP', filters)
export const getSimSwapReasonBreakdown = (filters: ReportFilters) => groupByColumn('swap_reason', 'SIM SWAP', filters)
export const getPortingIssueTypeBreakdown = (filters: ReportFilters) => groupByColumn('port_issue_type', 'PORTING', filters)

export interface QueueBreakdownData {
  primary: { label: string; rows: BreakdownRow[] }
  secondary?: { label: string; rows: BreakdownRow[] }
}

/** Composes the two (or one, for Porting) breakdown queries for whichever T2 queue tab is active — the single call site T2QueueBreakdownTabs' data comes from. */
export async function getQueueBreakdownData(queue: string, filters: ReportFilters): Promise<QueueBreakdownData> {
  if (queue === 'VOICE') {
    const [issueType, rootCause] = await Promise.all([getVoiceIssueTypeBreakdown(filters), getVoiceRootCauseBreakdown(filters)])
    return { primary: { label: 'Issue Type', rows: issueType }, secondary: { label: 'Root Cause', rows: rootCause } }
  }
  if (queue === 'SIM SWAP') {
    const [simType, swapReason] = await Promise.all([getSimSwapTypeBreakdown(filters), getSimSwapReasonBreakdown(filters)])
    return { primary: { label: 'SIM Type', rows: simType }, secondary: { label: 'Reason for Swap', rows: swapReason } }
  }
  if (queue === 'PORTING') {
    const portIssueType = await getPortingIssueTypeBreakdown(filters)
    return { primary: { label: 'Port Issue Type', rows: portIssueType } }
  }
  const [issueType, rootCause] = await Promise.all([getAdvancedIssueTypeBreakdown(filters), getAdvancedRootCauseBreakdown(filters)])
  return { primary: { label: 'Issue Type', rows: issueType }, secondary: { label: 'Root Cause', rows: rootCause } }
}
