import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { qaReviewCanView, qaReviewCanEdit, qaReviewCanDelete } from '@/lib/auth/authz'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import Header from '@/components/layout/Header'
import ReviewForm from '@/components/qaReviews/ReviewForm'
import ReviewOutcomeSummary from '@/components/qa/ReviewOutcomeSummary'
import { getReviewWithDetail, getReviewableAgents, getSettingsRows, getReasonTagTypes, getCoachingFlagTypes, getCoachingOwnerCandidates, getQueryCategories, reviewItemsToInputs } from '@/lib/qa/reviewPageData'
import { buildReviewOutcome } from '@/lib/qa/reviewOutcome'
import { applyLegs } from '@/lib/qa/scorecard'
import { DEPARTMENT_LABELS } from '@/lib/qa/constants'
import { isQaReviewer } from '@/lib/auth/authz'
import { Profile } from '@/types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function QaReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // A non-UUID id (e.g. a stale bookmark to a since-removed static route
  // under /qa-reviews/*) would otherwise reach getReviewWithDetail's `WHERE
  // r.id = ...` and crash on the uuid cast — redirect the same way an id
  // that IS a UUID but matches no row does, just below.
  if (!UUID_PATTERN.test(id)) redirect('/qa-reviews')

  const userId = await getCurrentUserId()
  if (!userId) redirect('/home')

  const [profile] = await sql<Pick<Profile, 'id' | 'full_name' | 'role'>[]>`
    SELECT id, full_name, role FROM profiles WHERE id = ${userId}`
  if (!profile) redirect('/home')

  const review = await getReviewWithDetail(id)
  if (!review) redirect('/qa-reviews')
  if (!qaReviewCanView(userId, profile.role, review.agent_id)) redirect('/qa-reviews')

  // The reviewed agent (anyone who isn't a QA reviewer) sees only the result,
  // a short why and the root causes — not the full scorecard.
  if (!isQaReviewer(profile.role)) {
    const [settingsRows, legacyRows] = await Promise.all([
      getSettingsRows(),
      review.root_cause_type_id
        ? sql<{ name: string }[]>`SELECT name FROM qa_critical_failure_types WHERE id = ${review.root_cause_type_id}`
        : Promise.resolve([]),
    ])
    const settings = settingsRows.find((s) => s.id === review.settings_id) ?? null
    const outcome = buildReviewOutcome({
      rating: review.rating_label,
      finalScore: review.final_score,
      items: applyLegs(reviewItemsToInputs(review.items), review.legs),
      reasonTags: review.criticalFailures.flatMap((cf) => {
        const t = cf.critical_failure_type
        return t?.item_code ? [{ name: t.name, item_code: t.item_code }] : []
      }),
      settings,
    })
    const rootCauses = review.criticalFailures
      .filter((cf) => cf.critical_failure_type && cf.critical_failure_type.item_code === null)
      .map((cf) => ({ name: cf.critical_failure_type!.name, notes: cf.notes }))

    return (
      <div className="flex-1 flex flex-col">
        <Header title="QA Review" userId={userId} userRole={profile.role} />
        <div className="p-6">
          <div className="max-w-2xl space-y-4">
            <Link href="/qa" className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
              <ChevronLeft className="w-4 h-4" /> My QA
            </Link>
            <div className="p-5 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  {DEPARTMENT_LABELS[review.department] ?? review.department} review · {review.interaction_date}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Reviewed by {review.reviewer?.full_name ?? 'Deleted user'}</p>
              </div>
              <ReviewOutcomeSummary
                outcome={outcome}
                rating={review.rating_label}
                finalScore={review.final_score}
                rootCauses={rootCauses}
                legacyRootCause={legacyRows[0]?.name ?? null}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const [agents, settingsRows, reasonTagTypes, coachingFlagTypes, ownerCandidates, categories] = await Promise.all([
    getReviewableAgents(),
    getSettingsRows(),
    getReasonTagTypes(),
    getCoachingFlagTypes(),
    getCoachingOwnerCandidates(),
    getQueryCategories(),
  ])

  // The reviewed agent may fall outside the assessable-agents pool (e.g. now
  // inactive) — make sure they still show up in the read-only display.
  let visibleAgents = agents
  if (review.agent_id && !visibleAgents.some((a) => a.id === review.agent_id) && review.agent) {
    visibleAgents = [...visibleAgents, { id: review.agent_id, full_name: review.agent.full_name, team_leader_full_name: null, department: null, t2_team: null, team_department: null }]
  }

  // The review's reviewer may fall outside the coaching-owner candidates pool
  // (e.g. now inactive or role-changed) — make sure they still show up in
  // the owner dropdown, same technique as the agent-dropdown fallback above.
  let visibleOwnerCandidates = ownerCandidates
  if (review.reviewer_id && !visibleOwnerCandidates.some((o) => o.id === review.reviewer_id) && review.reviewer) {
    visibleOwnerCandidates = [...visibleOwnerCandidates, { id: review.reviewer_id, full_name: review.reviewer.full_name }]
  }

  const readOnly = !qaReviewCanEdit(userId, profile.role, review.reviewer_id)

  return (
    <div className="flex-1 flex flex-col">
      <Header title="QA Review" userId={userId} userRole={profile.role} />
      <div className="p-6">
        <ReviewForm
          agents={visibleAgents}
          reviewerName={review.reviewer?.full_name ?? profile.full_name}
          settingsRows={settingsRows}
          reasonTagTypes={reasonTagTypes}
          coachingFlagTypes={coachingFlagTypes}
          categories={categories}
          existing={review}
          readOnly={readOnly}
          ownerCandidates={visibleOwnerCandidates}
          canManageCoaching={isQaReviewer(profile.role)}
          canDelete={qaReviewCanDelete(userId, profile.role, review.reviewer_id)}
        />
      </div>
    </div>
  )
}
