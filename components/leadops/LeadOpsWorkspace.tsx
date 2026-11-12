'use client'

import { useMemo, useState } from 'react'
import {
  Briefcase, CalendarRange, ClipboardList, FileText, Gauge, ListChecks,
} from 'lucide-react'
import { blocksForTemplate } from '@/lib/leadops/constants'
import FormErrorBanner from '@/components/ui/FormErrorBanner'
import type { LeadOpsScope } from '@/lib/leadops/featureFlag'
import { coachingSupportPercentage, plannerVariancePercentage, summariseDay } from '@/lib/leadops/plannerMath'
import { canViewManagerScorecard, canViewTeamLeaderData, isHod, isManagementTier, type LeadOpsViewerContext } from '@/lib/leadops/permissions'
import { templateIdForResolvedShift } from '@/lib/leadops/rosterShiftMapping'
import DataEntryTab from './DataEntryTab'
import ManagerScorecardTab from './managerScorecard/ManagerScorecardTab'
import PerformanceReviewTab from './PerformanceReviewTab'
import PlannerTab from './PlannerTab'
import { LeadOpsDataProvider, plannerDayFor, useLeadOpsData } from './LeadOpsDataProvider'
import ScorecardTab from './ScorecardTab'
import WeeklyLogTab from './WeeklyLogTab'

type TabKey = 'planner' | 'weekly' | 'scorecard' | 'reviews' | 'data_entry' | 'manager_scorecard'

interface Props {
  viewer: LeadOpsViewerContext
  /** 'prod': only the real-data tabs (Manager Scorecard, Data Entry's KPI Actuals). 'full': also the Phase 0 mock tabs (SIT). */
  scope: LeadOpsScope
  /** Today as an ISO date, resolved on the server so the month pickers match on server and client. */
  today: string
  /** The server's current instant (ISO) — drives the Time & Motion editing window. */
  nowIso?: string
}

/**
 * leadOps — role-filtered tabs over one shared store.
 *
 * FULL scope (SIT): HOD sees the full dashboard (Planner/Weekly Log/Scorecard/
 * Reviews) plus Data Entry, since an HOD can enter data too. Team Leader, Admin
 * and Management see only Data Entry and Performance Reviews — the dashboard
 * tabs are HOD-only, per the decision that leadOps-as-dashboard is strictly
 * an HOD view.
 *
 * PROD scope: only what is backed by real tables — the Manager Scorecard, Data
 * Entry's KPI Actuals, Daily & Weekly Activity, Time & Motion and Performance
 * Reviews (a team leader's own, or the ones management / the HOD run), and for
 * the HOD the read-only Planner and Weekly Activity Log; only the TL Efficiency
 * Scorecard is still mock, and it is not offered to anyone, whatever their role.
 *
 * Manager Scorecard is the one tab that ISN'T folded into the hod/!hod
 * split: it must reach a plain `management`-role viewer too (the manager
 * herself and her reviewer are not necessarily role='hod'). It is gated by
 * canViewManagerScorecard against the REAL configured manager (resolved
 * server-side from LEADOPS_MANAGER_EMAIL), not a hardcoded id.
 */
export default function LeadOpsWorkspace({ viewer, scope, today, nowIso }: Props) {
  return (
    <LeadOpsDataProvider viewer={viewer} scope={scope} today={today} nowIso={nowIso}>
      <LeadOpsWorkspaceTabs viewer={viewer} today={today} />
    </LeadOpsDataProvider>
  )
}

function LeadOpsWorkspaceTabs({ viewer, today }: { viewer: LeadOpsViewerContext; today: string }) {
  const { people, scope, persistError, dismissPersistError } = useLeadOpsData()
  const hod = isHod(viewer)
  const canSeeManagerScorecard = canViewManagerScorecard(viewer, people?.managerId ?? '')

  const tabs = useMemo(() => {
    const dataEntry = { key: 'data_entry' as const, label: 'Data Entry', icon: ClipboardList }
    const managerScorecard = { key: 'manager_scorecard' as const, label: 'Manager Scorecard', icon: Briefcase }
    const maybeManagerScorecard = canSeeManagerScorecard ? [managerScorecard] : []

    // Management oversees TLs' reviews from this tab (pick a TL, read/edit their review) — it's never "my own" for
    // them the way it is for a Team Leader, so it gets its own label rather than reusing either end.
    const reviewsLabel = hod ? 'Performance Reviews' : isManagementTier(viewer) ? 'TL Performance Review' : 'My Performance Review'
    const reviews = { key: 'reviews' as const, label: reviewsLabel, icon: FileText }

    if (scope === 'prod') {
      const planner = { key: 'planner' as const, label: 'Time & Motion Planner', icon: CalendarRange }
      const weekly = { key: 'weekly' as const, label: 'Weekly Activity Log', icon: ListChecks }
      const maybeReviews = canViewTeamLeaderData(viewer) ? [reviews] : []
      // HOD: dashboards, then the reviews they run, then data entry. Everyone else: data entry first, as before.
      return hod
        ? [...maybeManagerScorecard, planner, weekly, ...maybeReviews, dataEntry]
        : [...maybeManagerScorecard, dataEntry, ...maybeReviews]
    }

    if (!hod) return [dataEntry, reviews, ...maybeManagerScorecard]
    return [
      { key: 'planner' as const, label: 'Time & Motion Planner', icon: CalendarRange },
      { key: 'weekly' as const, label: 'Weekly Activity Log', icon: ListChecks },
      { key: 'scorecard' as const, label: 'TL Efficiency Scorecard', icon: Gauge },
      reviews,
      dataEntry,
      ...maybeManagerScorecard,
    ]
  }, [scope, hod, canSeeManagerScorecard, viewer])

  // null until the user picks a tab: the default is whatever is first NOW, so
  // it follows the tab list as the manager lookup loads rather than freezing
  // on whichever tab happened to be first before the data arrived.
  const [picked, setPicked] = useState<TabKey | null>(null)
  const tab = picked && tabs.some((t) => t.key === picked) ? picked : tabs[0].key

  return (
    <div className="space-y-4">
      {persistError && (
        <div className="flex items-start gap-3">
          <div className="flex-1"><FormErrorBanner message={persistError} /></div>
          <button type="button" onClick={dismissPersistError} className="shrink-0 text-xs text-gray-500 dark:text-gray-400 hover:underline pt-3">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1 w-fit max-w-full overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setPicked(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === key ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      <LeadOpsWorkspaceBody tab={tab} viewer={viewer} today={today} />
    </div>
  )
}

/**
 * Separated from the outer component purely so derivedValues (which needs
 * the store) can be computed with a plain hook call rather than reaching
 * into the Provider's internals from outside it.
 */
function LeadOpsWorkspaceBody({ tab, viewer, today }: { tab: TabKey; viewer: LeadOpsViewerContext; today: string }) {
  const { plannerDays, selectedTlId, selectedDate, resolvedShift, scope } = useLeadOpsData()

  /**
   * The two Time & Capacity KPIs are planner-derived. Computed from whatever
   * team leader/date the shared context currently points at, against
   * whichever shift the roster resolved for that TL/date — so Scorecard,
   * Reviews and Data Entry's KPI Actuals section all agree with the same
   * Planner data. No resolved shift (off/unknown/still loading) means no
   * template to score against.
   *
   * PROD scope: the planner is real but its KPIs are deliberately NOT derived
   * yet — return none, so those two KPIs read "Not tracked yet"; a later
   * change wires them up after the stored figures have been checked.
   */
  const derivedValues = useMemo<Record<string, number>>(() => {
    if (scope === 'prod') return {} as Record<string, number>
    const day = plannerDayFor(plannerDays, selectedTlId, selectedDate)
    const templateId = templateIdForResolvedShift(resolvedShift)
    const summary = summariseDay(templateId ? blocksForTemplate(templateId) : [], day.logs, day.unplanned)
    return {
      time_on_coaching_support: coachingSupportPercentage(summary),
      planner_adherence: plannerVariancePercentage(summary),
    }
  }, [scope, plannerDays, selectedTlId, selectedDate, resolvedShift])

  if (tab === 'planner') return <PlannerTab />
  if (tab === 'weekly') return <WeeklyLogTab />
  if (tab === 'scorecard') return <ScorecardTab derivedValues={derivedValues} />
  if (tab === 'reviews') return <PerformanceReviewTab viewer={viewer} today={today} />
  if (tab === 'manager_scorecard') return <ManagerScorecardTab viewer={viewer} />
  return <DataEntryTab viewer={viewer} derivedValues={derivedValues} />
}
