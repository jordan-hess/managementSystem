import { sql } from '@/lib/db/pool'

const MONTHS_TO_SHOW = 6

export interface VolumeMonthPoint {
  month: string
  requested: number
  completed: number
}

export interface VolumeSeries {
  categoryId: string
  categoryName: string
  points: VolumeMonthPoint[]
}

/**
 * One series per active case category, each with the last 6 months of
 * follow-ups requested (created) vs completed (resolved) in that category.
 * New categories automatically get a series with no code changes — this is
 * what lets the Home page's Volumes console grow with future KPIs.
 */
// Support-ticket channels shown as their own volume series, alongside the
// per-category follow-up series below — same requested-vs-completed shape,
// company-wide (not scoped to one agent), matching how category volumes work.
const CHANNEL_SERIES: { channel: string; label: string }[] = [
  { channel: 'hellopeter', label: 'HelloPeter' },
  { channel: 'freescout',  label: 'Freescout'  },
]

function buildMonthlySeries(
  months: Date[],
  rows: { created_at: string; resolved_at: string | null }[],
): VolumeMonthPoint[] {
  return months.map(monthStart => {
    const monthEndExclusive = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    const fallsInMonth = (iso: string | null) => {
      if (!iso) return false
      const d = new Date(iso)
      return d >= monthStart && d < monthEndExclusive
    }
    return {
      month: monthStart.toLocaleString('en-US', { month: 'short' }),
      requested: rows.filter(r => fallsInMonth(r.created_at)).length,
      completed: rows.filter(r => fallsInMonth(r.resolved_at)).length,
    }
  })
}

/**
 * getVolumesData is only ever called for management/admin callers (gated by
 * `canSeeVolumes` in app/(app)/home/page.tsx before it's invoked), so these
 * reads are intentionally unscoped across all agents — matching the
 * followups/support_tickets SELECT policies' admin/management branch (see
 * Database/migrations/management-followups-access.sql,
 * Database/migrations/support-tickets-schema.sql), same as the equivalent
 * company-wide reads in app/(app)/dashboard/page.tsx's management branch.
 */
export async function getVolumesData(): Promise<VolumeSeries[]> {
  const now = new Date()
  const months = Array.from({ length: MONTHS_TO_SHOW }, (_, i) =>
    new Date(now.getFullYear(), now.getMonth() - (MONTHS_TO_SHOW - 1 - i), 1))

  const [categories, followups, tickets] = await Promise.all([
    sql<{ id: string; name: string }[]>`SELECT id, name FROM case_categories WHERE is_active = true ORDER BY name`,
    // Small table today — grouping happens in JS below rather than a date-bounded
    // query. Revisit with a bounded range/RPC if follow-up volume grows large.
    sql<{ category_id: string | null; created_at: string; resolved_at: string | null }[]>`
      SELECT category_id, created_at, resolved_at FROM followups
    `,
    sql<{ channel: string; created_at: string; resolved_at: string | null }[]>`
      SELECT channel, created_at, resolved_at FROM support_tickets
    `,
  ])

  const categorySeries = categories.map(category => {
    const rows = followups.filter(f => f.category_id === category.id)
    return { categoryId: category.id, categoryName: category.name, points: buildMonthlySeries(months, rows) }
  })

  const channelSeries = CHANNEL_SERIES.map(({ channel, label }) => {
    const rows = tickets.filter(t => t.channel === channel)
    return { categoryId: `channel:${channel}`, categoryName: label, points: buildMonthlySeries(months, rows) }
  })

  return [...categorySeries, ...channelSeries]
}
