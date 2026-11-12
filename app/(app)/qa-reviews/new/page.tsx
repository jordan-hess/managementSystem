import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { qaReviewCanCreate } from '@/lib/auth/authz'
import { redirect } from 'next/navigation'
import Header from '@/components/layout/Header'
import ReviewForm from '@/components/qaReviews/ReviewForm'
import { getReviewableAgents, getSettingsRows, getReasonTagTypes, getCoachingFlagTypes, getCoachingOwnerCandidates, getQueryCategories } from '@/lib/qa/reviewPageData'
import { Profile } from '@/types'

export default async function NewQaReviewPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/home')

  const [profile] = await sql<Pick<Profile, 'id' | 'full_name' | 'role'>[]>`
    SELECT id, full_name, role FROM profiles WHERE id = ${userId}`
  if (!profile) redirect('/home')
  if (!qaReviewCanCreate(profile.role)) redirect('/qa-reviews')

  const [agents, settingsRows, reasonTagTypes, coachingFlagTypes, ownerCandidates, categories] = await Promise.all([
    getReviewableAgents(),
    getSettingsRows(),
    getReasonTagTypes(),
    getCoachingFlagTypes(),
    getCoachingOwnerCandidates(),
    getQueryCategories(),
  ])

  return (
    <div className="flex-1 flex flex-col">
      <Header title="New QA Review" userId={userId} userRole={profile.role} />
      <div className="p-6">
        <ReviewForm
          agents={agents}
          reviewerName={profile.full_name}
          settingsRows={settingsRows}
          reasonTagTypes={reasonTagTypes}
          coachingFlagTypes={coachingFlagTypes}
          categories={categories}
          ownerCandidates={ownerCandidates}
          canManageCoaching={true}
        />
      </div>
    </div>
  )
}
