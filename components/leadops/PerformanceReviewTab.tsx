'use client'

import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import FormErrorBanner from '@/components/ui/FormErrorBanner'
import { cardCls, mutedTextCls, sectionTitleCls } from '@/components/reports/theme'
import { canViewTeamLeaderData, isHod, isManagementTier, isTeamLeader, type LeadOpsViewerContext } from '@/lib/leadops/permissions'
import { REVIEW_MESSAGES, isMonthFinished, monthName, reviewMonthsWindow } from '@/lib/leadops/reviewLimits'
import ReviewerReview from './reviews/ReviewerReview'
import TeamLeaderReview from './reviews/TeamLeaderReview'
import { useReview } from './reviews/useReview'
import { useReviewRoster } from './reviews/useReviewRoster'
import { btnOutline, labelCls } from './statusStyles'

interface Props {
  viewer: LeadOpsViewerContext
  /** Today as an ISO date, resolved on the server. */
  today: string
}

const selectCls = 'text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]'

function statusLabel(status: string | null): string {
  return status === null ? 'No review yet' : status.charAt(0).toUpperCase() + status.slice(1)
}

/**
 * Performance Reviews. A team leader sees their OWN shared review (and can acknowledge it); management and the HOD pick a
 * team leader and a month, write the review, share it and — the HOD only — reopen an acknowledged one. This shell only
 * chooses WHO and WHICH MONTH and which screen to show; the screens own their own state, and a screen is never shown
 * for anything but the person and month currently selected (loading is shown instead).
 */
export default function PerformanceReviewTab({ viewer, today }: Props) {
  const canView = canViewTeamLeaderData(viewer)
  const reviewer = isManagementTier(viewer)
  const teamLeader = !reviewer && isTeamLeader(viewer)

  const months = useMemo(() => [...reviewMonthsWindow(today)].sort().reverse(), [today])
  const [period, setPeriod] = useState(() => months.find((m) => isMonthFinished(m, today)) ?? months[0])

  const roster = useReviewRoster(period, reviewer)
  const [pickedTl, setPickedTl] = useState<string | null>(null)
  const person = reviewer ? (roster.people.find((p) => p.id === pickedTl) ?? roster.people[0] ?? null) : null
  const tlId = teamLeader ? viewer.profileId : (person?.id ?? '')

  const review = useReview(tlId, period, canView)

  if (!canView) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <Lock className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <h2 className={sectionTitleCls}>No performance review to show</h2>
        <p className={`${mutedTextCls} mt-1 max-w-md mx-auto`}>
          Each team leader&apos;s review is private to them. This account isn&apos;t a team leader, so there is nothing here to view — ask
          Management if you need access to a specific team leader&apos;s review.
        </p>
      </div>
    )
  }

  function body() {
    if (reviewer) {
      if (roster.loading) return <p className={mutedTextCls}>Loading…</p>
      if (roster.error) return <ReloadBanner message={roster.error} onRetry={roster.reload} />
      if (!person) return <div className={`${cardCls} p-8 text-center`}><p className={mutedTextCls}>No team leaders to review.</p></div>
    }
    if (review.loading) return <p className={mutedTextCls}>Loading…</p>
    if (review.error || !review.view) return <ReloadBanner message={review.error ?? REVIEW_MESSAGES.loadFailed} onRetry={review.reload} />

    const view = review.view
    if (teamLeader) {
      if (view.kind !== 'team_leader') return <ReloadBanner message={REVIEW_MESSAGES.loadFailed} onRetry={review.reload} />
      return <TeamLeaderReview view={view} period={period} onAcknowledge={review.acknowledge} onViewed={review.markViewed} onReload={review.reload} />
    }
    if (view.kind !== 'reviewer' || !person) return <ReloadBanner message={REVIEW_MESSAGES.loadFailed} onRetry={review.reload} />
    return (
      <ReviewerReview
        key={`${tlId}|${period}|${review.reloadCount}`}
        tlId={tlId}
        tlName={person.name}
        period={period}
        todayDate={today}
        view={view}
        isHod={isHod(viewer)}
        onSave={review.saveDraft}
        onShare={review.share}
        onReopen={review.reopen}
        onReload={review.reload}
        onPeekRevision={review.peekRevision}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls} htmlFor="review-month">Month</label>
          <select id="review-month" value={period} onChange={(e) => setPeriod(e.target.value)} className={selectCls}>
            {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        </div>
        {reviewer && !roster.loading && !roster.error && roster.people.length > 0 && (
          <div>
            <label className={labelCls} htmlFor="review-tl">Team leader</label>
            <select id="review-tl" value={person?.id ?? ''} onChange={(e) => setPickedTl(e.target.value)} className={selectCls}>
              {roster.people.map((p) => <option key={p.id} value={p.id}>{p.name} — {statusLabel(p.status)}</option>)}
            </select>
          </div>
        )}
      </div>
      {body()}
    </div>
  )
}

function ReloadBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1"><FormErrorBanner message={message} /></div>
      <button type="button" onClick={onRetry} className={`${btnOutline} shrink-0`}>Try again</button>
    </div>
  )
}
