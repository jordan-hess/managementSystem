'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Lock } from 'lucide-react'
import { cardCls, mutedTextCls, sectionTitleCls } from '@/components/reports/theme'
import { MANAGER_KPAS, PILLAR_LABELS } from '@/lib/leadops/constants'
import {
  computeManagerKpa, isProvisional, managerRag, overallAndPillars,
} from '@/lib/leadops/managerScoring'
import {
  canEditTlTeamSize, canEnterManagerSelfRating, canReviewManagerScorecard, canViewManagerScorecard,
  type LeadOpsViewerContext,
} from '@/lib/leadops/permissions'
import type { ManagerKpaComputed, ManagerReviewStatus, ManagerScorecardSnapshot } from '@/lib/leadops/types'
import { useLeadOpsData } from '../LeadOpsDataProvider'
import { MANAGER_RAG_CLS, MANAGER_RAG_LABELS, badgeCls, btnOutline, btnPrimary, labelCls } from '../statusStyles'
import HistoryTable from './HistoryTable'
import KpaTable from './KpaTable'
import MonthlyReviewForm from './MonthlyReviewForm'
import TeamSizePanel from './TeamSizePanel'
import TlBreakdownDrawer from './TlBreakdownDrawer'

const STATUS_LABELS: Record<ManagerReviewStatus, string> = {
  draft: 'Draft',
  self_submitted: 'Self-assessment submitted',
  reviewed: 'Reviewed',
  locked: 'Locked',
}

/**
 * leadOps Manager Scorecard — department roll-up KPAs (computed from the
 * real per-TL KPI scores) plus a monthly self/reviewer review on the 5
 * Rated KPAs, mirroring the TL Efficiency Scorecard's own review cadence.
 * See docs/manager-scorecard.md for the full reasoning behind every
 * adaptation from the source spec (the TL engine isn't weighted, there's
 * no real persistence yet, etc.).
 *
 * Unlike the TL-scoped tabs, there is only ONE manager (Alex) today, so
 * this tab is not keyed by a selectable id — canViewManagerScorecard
 * already decides whether the current viewer gets to see her scorecard at
 * all (herself, or anyone management-tier).
 */
export default function ManagerScorecardTab({ viewer }: { viewer: LeadOpsViewerContext }) {
  const {
    tlTeamSizes, managerKpaRatings, managerReviews, realDataLoading, realDataError,
    selectedManagerMonth, setSelectedManagerMonth, managerMonths, teamLeaders, people, peopleError,
    rollupWeighting, setRollupWeighting, scores, upsertTlTeamSize, upsertManagerKpaRating, upsertManagerReview,
  } = useLeadOpsData()

  // The configured manager and reviewer (resolved server-side from the
  // LEADOPS_MANAGER_EMAIL / LEADOPS_REVIEWER_EMAIL accounts). Empty while they
  // are unavailable — the early returns below show why before anything uses them.
  const managerId = people?.managerId ?? ''
  const reviewerId = people?.reviewerId ?? ''
  const [breakdownKpa, setBreakdownKpa] = useState<ManagerKpaComputed | null>(null)

  const canView = canViewManagerScorecard(viewer, managerId)
  const canEnterSelf = canEnterManagerSelfRating(viewer, managerId)
  const canReview = canReviewManagerScorecard(viewer, managerId)
  const canEditTeamSize = canEditTlTeamSize(viewer)

  const review = managerReviews.find((r) => r.manager_id === managerId && r.month === selectedManagerMonth)
  const isLocked = review?.status === 'locked' && !!review.locked_snapshot
  const monthRatings = managerKpaRatings.filter((r) => r.manager_id === managerId && r.month === selectedManagerMonth)

  const liveKpas = useMemo(() => MANAGER_KPAS.map((kpa) => computeManagerKpa(kpa, selectedManagerMonth, {
    teamLeaders,
    teamSizes: tlTeamSizes,
    scores,
    rating: monthRatings.find((r) => r.kpa_key === kpa.key),
    weighting: rollupWeighting,
  })), [teamLeaders, tlTeamSizes, scores, monthRatings, rollupWeighting, selectedManagerMonth])

  const live = useMemo(() => {
    const { overallPct, pillars } = overallAndPillars(liveKpas)
    return { kpas: liveKpas, overallPct, pillars, rag: managerRag(overallPct), provisional: isProvisional(liveKpas) }
  }, [liveKpas])

  const display = isLocked ? {
    kpas: review!.locked_snapshot!.kpas,
    overallPct: review!.locked_snapshot!.overallPct,
    pillars: review!.locked_snapshot!.pillars,
    rag: review!.locked_snapshot!.rag,
    provisional: review!.locked_snapshot!.provisional,
  } : live

  function lockReview() {
    const snapshot: ManagerScorecardSnapshot = {
      month: selectedManagerMonth, managerId, kpas: live.kpas, pillars: live.pillars, overallPct: live.overallPct, rag: live.rag, provisional: live.provisional,
    }
    upsertManagerReview(managerId, selectedManagerMonth, reviewerId, { status: 'locked', locked_snapshot: snapshot })
  }

  if (!canView) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <Lock className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <h2 className={sectionTitleCls}>No manager scorecard to show</h2>
        <p className={`${mutedTextCls} mt-1 max-w-md mx-auto`}>The Manager Scorecard is private to the manager it belongs to, and to Management/HOD.</p>
      </div>
    )
  }

  if (realDataLoading) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <Loader2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3 animate-spin" />
        <p className={mutedTextCls}>Loading the scorecard from the database…</p>
      </div>
    )
  }

  if (realDataError) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <h2 className={sectionTitleCls}>Couldn&apos;t load the scorecard</h2>
        <p className={`${mutedTextCls} mt-1 max-w-md mx-auto`}>{realDataError}</p>
      </div>
    )
  }

  if (!people) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
        <h2 className={sectionTitleCls}>Manager scorecard isn&apos;t set up</h2>
        <p className={`${mutedTextCls} mt-1 max-w-md mx-auto`}>{peopleError ?? 'The manager and reviewer for this scorecard could not be determined.'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls} htmlFor="mgr-sc-month">Month</label>
            <select
              id="mgr-sc-month"
              value={selectedManagerMonth}
              onChange={(e) => setSelectedManagerMonth(e.target.value)}
              className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]"
            >
              {managerMonths.map((m) => <option key={m} value={m}>{m.slice(0, 7)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="mgr-sc-weighting">Roll-up weighting</label>
            <select
              id="mgr-sc-weighting"
              value={rollupWeighting}
              onChange={(e) => setRollupWeighting(e.target.value as typeof rollupWeighting)}
              disabled={isLocked}
              className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark] disabled:opacity-60"
              title="For side-by-side comparison against an unweighted Excel figure during rollout"
            >
              <option value="team_size">Team-size weighted</option>
              <option value="equal">Equal weight</option>
            </select>
          </div>
        </div>
        {isLocked && <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400`}><Lock className="w-3 h-3" /> Locked — showing the snapshot from when this month was locked</span>}
      </div>

      <div className={`${cardCls} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{people.managerName}</h1>
            <p className={mutedTextCls}>Reviewed by {people.reviewerName} · {selectedManagerMonth.slice(0, 7)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`${badgeCls} ${MANAGER_RAG_CLS[display.rag]} text-sm`}>{display.overallPct === null ? '—' : `${display.overallPct}%`} · {MANAGER_RAG_LABELS[display.rag]}</span>
            <span className={`${badgeCls} ${display.provisional ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'}`}>
              {display.provisional ? 'Provisional' : 'Agreed'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          {display.pillars.map((p) => (
            <div key={p.pillar}>
              <p className={mutedTextCls}>{PILLAR_LABELS[p.pillar]}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{p.pct === null ? '—' : `${p.pct}%`}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className={sectionTitleCls}>KPAs</h2>
        </div>
        <KpaTable kpas={display.kpas} onViewBreakdown={setBreakdownKpa} />
      </div>

      <MonthlyReviewForm
        key={selectedManagerMonth}
        month={selectedManagerMonth}
        managerId={managerId}
        ratings={monthRatings}
        canEnterSelf={canEnterSelf && !isLocked}
        canReview={canReview && !isLocked}
        onSave={upsertManagerKpaRating}
      />

      {!isLocked && (
        <div className={`${cardCls} p-5 flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400`}>
              Status: {STATUS_LABELS[review?.status ?? 'draft']}
            </span>
            <p className={`${mutedTextCls} mt-1`}>Once every Rated KPA has a reviewer rating, lock the month — the scorecard then always shows this exact snapshot, even if underlying data changes later.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEnterSelf && (!review || review.status === 'draft') && (
              <button type="button" onClick={() => upsertManagerReview(managerId, selectedManagerMonth, reviewerId, { status: 'self_submitted' })} className={btnOutline}>
                Submit self-assessment
              </button>
            )}
            {canReview && review?.status === 'self_submitted' && (
              <button type="button" onClick={() => upsertManagerReview(managerId, selectedManagerMonth, reviewerId, { status: 'reviewed' })} className={btnOutline}>
                Mark reviewed
              </button>
            )}
            {canReview && (review?.status === 'reviewed' || review?.status === 'self_submitted') && (
              <button type="button" onClick={lockReview} className={btnPrimary}>Lock month</button>
            )}
          </div>
        </div>
      )}

      <TeamSizePanel
        key={selectedManagerMonth}
        teamLeaders={teamLeaders}
        teamSizes={tlTeamSizes}
        month={selectedManagerMonth}
        canEdit={canEditTeamSize && !isLocked}
        onSave={upsertTlTeamSize}
      />

      <HistoryTable reviews={managerReviews} />

      <TlBreakdownDrawer computed={breakdownKpa} month={selectedManagerMonth} scores={scores} onClose={() => setBreakdownKpa(null)} />
    </div>
  )
}
