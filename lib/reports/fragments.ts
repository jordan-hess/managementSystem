import { sql } from '@/lib/db/pool'
import { QUEUES } from '@/lib/t2/constants'
import { SOCIAL_QUEUES } from '@/lib/queues/constants'
import { ReportFilters } from './filters'
import { toExclusiveDate } from './dateRanges'

export function isT2Queue(queue: string | undefined): boolean {
  return !!queue && (QUEUES as readonly string[]).includes(queue)
}
export function isSocialChannel(queue: string | undefined): boolean {
  return !!queue && (SOCIAL_QUEUES as readonly string[]).includes(queue)
}

// Status groupings — documented once, reused by every lib/reports/* query.
// Open = mid-lifecycle, not yet escalated/resolved/closed. T2's
// awaiting_t3/t3_responded stay "Open" (still mid-escalation-workflow, not
// the escalation event itself). Resolved = resolved OR closed (both count
// as "done" for reporting purposes). Escalated = the escalation event only.
export const T2_OPEN_STATUSES = ['open', 'in_progress', 'awaiting_t3', 't3_responded']
export const T2_RESOLVED_STATUSES = ['resolved', 'closed']
export const T2_ESCALATED_STATUSES = ['escalated']
export const SOCIAL_OPEN_STATUSES = ['open', 'in_progress', 'follow_up', 'callback']
export const SOCIAL_RESOLVED_STATUSES = ['resolved', 'closed']
export const SOCIAL_ESCALATED_STATUSES = ['escalated']

export function t2StatusListForFilter(status: ReportFilters['status']): string[] | null {
  if (status === 'open') return T2_OPEN_STATUSES
  if (status === 'resolved') return T2_RESOLVED_STATUSES
  if (status === 'escalated') return T2_ESCALATED_STATUSES
  return null
}
export function socialStatusListForFilter(status: ReportFilters['status']): string[] | null {
  if (status === 'open') return SOCIAL_OPEN_STATUSES
  if (status === 'resolved') return SOCIAL_RESOLVED_STATUSES
  if (status === 'escalated') return SOCIAL_ESCALATED_STATUSES
  return null
}

// Date fragments — the TEXT-vs-timestamptz split, centralized once. T2's
// tickets.created_at is UTC-naive TEXT ('YYYY-MM-DD HH:MI:SS'); comparing it
// via a plain ::timestamp cast (naive-to-naive) needs no +'Z' suffix trick —
// that trick is only for JS's Date constructor, not Postgres casts.
// support_tickets.created_at is real timestamptz, cast directly.
export function t2DateFragment(from: string, to: string) {
  const toExclusive = toExclusiveDate(to)
  return sql`AND t.created_at::timestamp >= ${from}::timestamp AND t.created_at::timestamp < ${toExclusive}::timestamp`
}
export function socialDateFragment(from: string, to: string) {
  const toExclusive = toExclusiveDate(to)
  return sql`AND st.created_at >= ${from}::timestamptz AND st.created_at < ${toExclusive}::timestamptz`
}

/** AND false when filters.team excludes T2 entirely, so a UNIONed/joined query's T2 side contributes zero rows rather than being structurally absent. */
export function t2QueueFragment(filters: ReportFilters) {
  if (filters.team === 'social') return sql`AND false`
  if (filters.queue && isT2Queue(filters.queue)) return sql`AND t.queue = ${filters.queue}`
  return sql``
}
export function socialChannelFragment(filters: ReportFilters) {
  if (filters.team === 't2') return sql`AND false`
  if (filters.queue && isSocialChannel(filters.queue)) return sql`AND st.channel = ${filters.queue}`
  return sql``
}

// issueType/rootCause are generic "primary/secondary classification" filter
// slots, not fixed to the issue_type/root_cause columns — which column they
// target depends on the selected queue, mirroring FilterBar's relabeling
// (see filterVisibility.ts): SIM SWAP repoints them at sim_type/swap_reason,
// PORTING repoints issueType at port_issue_type (no secondary slot for
// Porting). This lets one pair of URL params drive every queue's
// queue-specific filter without growing ReportFilters per queue.
export function t2IssueTypeFragment(filters: ReportFilters) {
  if (!filters.issueType || isSocialChannel(filters.queue)) return sql``
  const column = filters.queue === 'SIM SWAP' ? 'sim_type' : filters.queue === 'PORTING' ? 'port_issue_type' : 'issue_type'
  return sql`AND t.${sql(column)} = ${filters.issueType}`
}
export function t2RootCauseFragment(filters: ReportFilters) {
  if (!filters.rootCause || filters.queue === 'PORTING' || isSocialChannel(filters.queue)) return sql``
  const column = filters.queue === 'SIM SWAP' ? 'swap_reason' : 'root_cause'
  return sql`AND t.${sql(column)} = ${filters.rootCause}`
}

export function socialIssueTypeFragment(filters: ReportFilters) {
  if (!filters.issueType || isT2Queue(filters.queue)) return sql``
  return sql`AND st.issue_type = ${filters.issueType}`
}
export function socialRootCauseFragment(filters: ReportFilters) {
  if (!filters.rootCause || isT2Queue(filters.queue)) return sql``
  return sql`AND st.root_cause = ${filters.rootCause}`
}

export function t2StatusFragment(filters: ReportFilters) {
  const list = t2StatusListForFilter(filters.status)
  return list ? sql`AND t.status IN ${sql(list)}` : sql``
}
export function socialStatusFragment(filters: ReportFilters) {
  const list = socialStatusListForFilter(filters.status)
  return list ? sql`AND st.status IN ${sql(list)}` : sql``
}
