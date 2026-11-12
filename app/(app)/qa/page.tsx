import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { redirect } from 'next/navigation'
import { startOfMonth, endOfMonth, getDaysInMonth, format } from 'date-fns'
import Header from '@/components/layout/Header'
import WarningsPanel from '@/components/dashboard/WarningsPanel'
import MyQaBoard from '@/components/qa/MyQaBoard'
import { getMyReviewsForMonth, getOpenCoachingActionsForAgent } from '@/lib/qa/reviewPageData'
import { computeWeekBuckets, groupReviewsByWeek } from '@/lib/qa/weekBuckets'
import { Profile, Warning } from '@/types'

export default async function MyQaPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/home')

  const [profile] = await sql<Pick<Profile, 'id' | 'full_name' | 'role'>[]>`
    SELECT id, full_name, role FROM profiles WHERE id = ${userId}`
  if (!profile) redirect('/home')
  // T2-restricted agents never reach here at all (proxy.ts's T2_AGENT_ALLOWED_PREFIXES
  // doesn't include /qa) — this only needs to keep out non-agent roles.
  if (profile.role !== 'agent') redirect('/dashboard')

  const today = new Date()
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')

  const [warnings, monthReviews, openCoachingActions] = await Promise.all([
    // Same rule as WarningsManager's admin view, narrowed to self — an agent
    // may always see warnings issued to them.
    sql<(Warning & { issuer: { id: string; full_name: string } })[]>`
      SELECT w.*, jsonb_build_object('id', iss.id, 'full_name', COALESCE(iss.full_name, 'Deleted user')) AS issuer
      FROM warnings w LEFT JOIN profiles iss ON iss.id = w.issued_by
      WHERE w.issued_to = ${userId}
      ORDER BY w.created_at DESC`,
    getMyReviewsForMonth(userId, monthStart, monthEnd),
    getOpenCoachingActionsForAgent(userId),
  ])

  const weekBuckets = computeWeekBuckets(getDaysInMonth(today))
  const weekGroups = groupReviewsByWeek(monthReviews, weekBuckets)

  return (
    <div className="flex-1 flex flex-col">
      <Header title="My QA" userId={userId} userRole={profile.role} />
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{format(today, 'MMMM yyyy')} Reviews</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Your QA reviews this month, grouped by week.</p>
          <MyQaBoard weekGroups={weekGroups} openCoachingActions={openCoachingActions} />
        </div>
        <WarningsPanel warnings={(warnings ?? []) as Warning[]} sticky={false} />
      </div>
    </div>
  )
}
