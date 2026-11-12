import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { qaConfigCanManage } from '@/lib/auth/authz'
import { redirect } from 'next/navigation'
import Header from '@/components/layout/Header'
import SettingsManager from '@/components/qaReviews/SettingsManager'
import QueryCategoriesManager from '@/components/qaReviews/QueryCategoriesManager'
import { getSettingsHistory, getQueryCategories } from '@/lib/qa/reviewPageData'
import { getBusinessToday, formatDateKey } from '@/lib/roster/calendarUtils'
import { Role } from '@/types'

export default async function QaSettingsPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/home')

  const [profile] = await sql<{ id: string; role: Role }[]>`SELECT id, role FROM profiles WHERE id = ${userId}`
  if (!profile) redirect('/home')
  if (!qaConfigCanManage(profile.role)) redirect('/qa-reviews')

  const [history, categories] = await Promise.all([getSettingsHistory(), getQueryCategories()])

  return (
    <div className="flex-1 flex flex-col">
      <Header title="QA Scorecard Settings" userId={userId} userRole={profile.role} />
      <div className="p-6 space-y-8">
        <SettingsManager history={history} today={formatDateKey(getBusinessToday())} />
        <QueryCategoriesManager categories={categories} />
      </div>
    </div>
  )
}
