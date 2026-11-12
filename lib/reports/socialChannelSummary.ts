import { sql } from '@/lib/db/pool'
import { SOCIAL_QUEUES } from '@/lib/queues/constants'
import { ReportFilters } from './filters'
import { toExclusiveDate } from './dateRanges'
import { socialChannelFragment, socialIssueTypeFragment, socialRootCauseFragment, SOCIAL_RESOLVED_STATUSES, SOCIAL_ESCALATED_STATUSES } from './fragments'

export interface ChannelSummaryRow {
  channel: string
  volume: number
  pctOfSocial: number
  resolved: number
  escalated: number
}

interface RawRow { channel: string; volume: string; resolved: string; escalated: string }

/** One GROUP BY st.channel query — pctOfSocial computed in JS over the resulting rows, not per-ticket. */
export async function getSocialChannelSummary(filters: ReportFilters): Promise<ChannelSummaryRow[]> {
  const toExclusive = toExclusiveDate(filters.to)

  const rows = await sql<RawRow[]>`
    SELECT
      st.channel AS channel,
      COUNT(*) AS volume,
      COUNT(*) FILTER (WHERE st.status = ANY(${SOCIAL_RESOLVED_STATUSES})) AS resolved,
      COUNT(*) FILTER (WHERE st.status = ANY(${SOCIAL_ESCALATED_STATUSES})) AS escalated
    FROM support_tickets st
    WHERE st.created_at >= ${filters.from}::timestamptz AND st.created_at < ${toExclusive}::timestamptz
      AND st.channel = ANY(${SOCIAL_QUEUES as unknown as string[]})
      ${socialChannelFragment(filters)} ${socialIssueTypeFragment(filters)} ${socialRootCauseFragment(filters)}
    GROUP BY st.channel
  `

  const total = rows.reduce((sum, r) => sum + Number(r.volume), 0)

  return SOCIAL_QUEUES.map((channel) => {
    const row = rows.find((r) => r.channel === channel)
    const volume = row ? Number(row.volume) : 0
    return {
      channel,
      volume,
      pctOfSocial: total === 0 ? 0 : (volume / total) * 100,
      resolved: row ? Number(row.resolved) : 0,
      escalated: row ? Number(row.escalated) : 0,
    }
  })
}
