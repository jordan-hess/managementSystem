import { sql } from '@/lib/db/pool'
import { QUEUES } from '@/lib/t2/constants'
import { ReportFilters } from './filters'
import { toExclusiveDate } from './dateRanges'
import { t2QueueFragment, t2IssueTypeFragment, t2RootCauseFragment, T2_OPEN_STATUSES, T2_RESOLVED_STATUSES, T2_ESCALATED_STATUSES } from './fragments'

export interface QueueSummaryRow {
  queue: string
  volume: number
  pctOfT2: number
  open: number
  resolved: number
  escalated: number
}

interface RawRow { queue: string; volume: string; open: string; resolved: string; escalated: string }

/** One GROUP BY t.queue query — pctOfT2 is computed in JS over the resulting 4 rows, not per-ticket. */
export async function getT2QueueSummary(filters: ReportFilters): Promise<QueueSummaryRow[]> {
  const toExclusive = toExclusiveDate(filters.to)

  const rows = await sql<RawRow[]>`
    SELECT
      t.queue AS queue,
      COUNT(*) AS volume,
      COUNT(*) FILTER (WHERE t.status = ANY(${T2_OPEN_STATUSES})) AS open,
      COUNT(*) FILTER (WHERE t.status = ANY(${T2_RESOLVED_STATUSES})) AS resolved,
      COUNT(*) FILTER (WHERE t.status = ANY(${T2_ESCALATED_STATUSES})) AS escalated
    FROM tickets t
    WHERE t.created_at::timestamp >= ${filters.from}::timestamp AND t.created_at::timestamp < ${toExclusive}::timestamp
      AND t.queue = ANY(${QUEUES as unknown as string[]})
      ${t2QueueFragment(filters)} ${t2IssueTypeFragment(filters)} ${t2RootCauseFragment(filters)}
    GROUP BY t.queue
  `

  const total = rows.reduce((sum, r) => sum + Number(r.volume), 0)

  return QUEUES.map((queue) => {
    const row = rows.find((r) => r.queue === queue)
    const volume = row ? Number(row.volume) : 0
    return {
      queue,
      volume,
      pctOfT2: total === 0 ? 0 : (volume / total) * 100,
      open: row ? Number(row.open) : 0,
      resolved: row ? Number(row.resolved) : 0,
      escalated: row ? Number(row.escalated) : 0,
    }
  })
}
