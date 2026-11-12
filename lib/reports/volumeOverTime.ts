import { sql } from '@/lib/db/pool'
import { QUEUES } from '@/lib/t2/constants'
import { ReportFilters } from './filters'
import { toExclusiveDate } from './dateRanges'
import {
  t2QueueFragment, socialChannelFragment, t2IssueTypeFragment, t2RootCauseFragment,
  socialIssueTypeFragment, socialRootCauseFragment,
  t2StatusFragment, socialStatusFragment,
} from './fragments'

export type Granularity = 'day' | 'week' | 'month'

export function isGranularity(value: string | undefined): value is Granularity {
  return value === 'day' || value === 'week' || value === 'month'
}

// date_trunc's unit and generate_series' step, keyed off a validated
// Granularity — never built from raw request input, so there's no
// injection surface even though both are interpolated as SQL text.
const TRUNC_UNIT: Record<Granularity, string> = { day: 'day', week: 'week', month: 'month' }
const STEP_INTERVAL: Record<Granularity, string> = { day: '1 day', week: '1 week', month: '1 month' }

export interface VolumePoint {
  bucket: string // 'YYYY-MM-DD', the bucket's start date
  total: number
  t2: number
  social: number
}

interface RawRow { bucket: string; t2: string; social: string; total: string }

/**
 * A zero-filled bucket spine (generate_series) LEFT JOINed to per-table
 * date_trunc'd counts, so gaps in either table produce a zero point
 * instead of a missing one. Social's created_at (timestamptz) is
 * normalized `AT TIME ZONE 'UTC'` before truncation so its buckets align
 * with T2's UTC-naive TEXT dates on the same calendar day/week/month.
 */
export async function getVolumeOverTime(filters: ReportFilters, granularity: Granularity): Promise<VolumePoint[]> {
  const trunc = TRUNC_UNIT[granularity]
  const step = STEP_INTERVAL[granularity]
  const toExclusive = toExclusiveDate(filters.to)

  const rows = await sql<RawRow[]>`
    WITH spine AS (
      SELECT generate_series(
        date_trunc(${trunc}, ${filters.from}::timestamp),
        date_trunc(${trunc}, ${filters.to}::timestamp),
        ${step}::interval
      ) AS bucket
    ),
    t2_counts AS (
      SELECT date_trunc(${trunc}, t.created_at::timestamp) AS bucket, COUNT(*) AS cnt
      FROM tickets t
      WHERE t.created_at::timestamp >= ${filters.from}::timestamp AND t.created_at::timestamp < ${toExclusive}::timestamp
        AND t.queue = ANY(${QUEUES as unknown as string[]})
        ${t2QueueFragment(filters)} ${t2IssueTypeFragment(filters)} ${t2RootCauseFragment(filters)} ${t2StatusFragment(filters)}
      GROUP BY 1
    ),
    social_counts AS (
      SELECT date_trunc(${trunc}, st.created_at AT TIME ZONE 'UTC') AS bucket, COUNT(*) AS cnt
      FROM support_tickets st
      WHERE st.created_at >= ${filters.from}::timestamptz AND st.created_at < ${toExclusive}::timestamptz
        ${socialChannelFragment(filters)} ${socialStatusFragment(filters)} ${socialIssueTypeFragment(filters)} ${socialRootCauseFragment(filters)}
      GROUP BY 1
    )
    SELECT
      to_char(spine.bucket, 'YYYY-MM-DD') AS bucket,
      COALESCE(t2_counts.cnt, 0) AS t2,
      COALESCE(social_counts.cnt, 0) AS social,
      COALESCE(t2_counts.cnt, 0) + COALESCE(social_counts.cnt, 0) AS total
    FROM spine
    LEFT JOIN t2_counts ON t2_counts.bucket = spine.bucket
    LEFT JOIN social_counts ON social_counts.bucket = spine.bucket
    ORDER BY spine.bucket
  `

  return rows.map((r) => ({ bucket: r.bucket, total: Number(r.total), t2: Number(r.t2), social: Number(r.social) }))
}
