'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, ClipboardList, Gauge, Lock } from 'lucide-react'
import { cardCls, mutedTextCls, sectionTitleCls } from '@/components/reports/theme'
import {
  canEnterKpiActual, canEnterManagerWeekly, canEnterSourceData, canSelectTeamLeader, canVerifyKpi,
  canViewTeamLeaderData, isTeamLeader,
  type LeadOpsViewerContext,
} from '@/lib/leadops/permissions'
import { useLeadOpsData } from './LeadOpsDataProvider'
import DailySection from './dataEntry/DailySection'
import WeeklySection from './dataEntry/WeeklySection'
import KpiActualsSection from './dataEntry/KpiActualsSection'
import TimeMotionSection from './dataEntry/TimeMotionSection'
import { labelCls } from './statusStyles'

type SectionKey = 'daily' | 'time_motion' | 'kpi'

const SECTIONS: { key: SectionKey; label: string; icon: typeof Gauge }[] = [
  { key: 'daily', label: 'Daily & Weekly Activity', icon: ClipboardList },
  { key: 'time_motion', label: 'Time & Motion', icon: CalendarClock },
  { key: 'kpi', label: 'KPI Actuals', icon: Gauge },
]

interface Props {
  viewer: LeadOpsViewerContext
  derivedValues: Record<string, number>
}

/**
 * leadOps Data Entry — the input layer. "Users enter actual work/data →
 * leadOps calculates the relevant metrics → dashboards/scorecards use those
 * results": nothing on this page is a calculated field (score, RAG, average,
 * weighted result, adherence %) — those render read-only on Planner/
 * Scorecard/Reviews, computed in lib/leadops/.
 *
 * Team leaders come from the real `team_leaders` table (one entry per person):
 * a signed-in Team Leader is always on their OWN record (their profile id is
 * the `tl_id` KPI actuals are keyed by), Management/HOD pick from the list.
 * All three sections (Daily & Weekly Activity, Time & Motion, KPI Actuals) are
 * real in the PROD scope.
 *
 * PRIVACY: each team leader's Data Entry is private to that team leader.
 * A plain Admin (canViewTeamLeaderData false) sees NO team leader's data at
 * all — not even a picker. See lib/leadops/permissions.ts.
 */
export default function DataEntryTab({ viewer, derivedValues }: Props) {
  const {
    selectedTlId, setSelectedTlId, selectedDate, setSelectedDate, selectedWeekStart,
    scope, teamLeaders, realDataLoading, realDataError, selectedManagerMonth, setSelectedManagerMonth, managerMonths,
    weekStarts, todayDate, activityLoading, activityError, plannerLoading, plannerError, resolvedShiftLoading,
  } = useLeadOpsData()
  const timeMotionLoading = plannerLoading || resolvedShiftLoading
  // PROD and SIT offer the same sections now that Time & Motion is real.
  const sections = SECTIONS
  // A team leader's daily job is the daily entry; management lands on KPI Actuals (they cannot enter daily activity for others).
  const [section, setSection] = useState<SectionKey>(scope === 'prod' && !canEnterSourceData(viewer) ? 'kpi' : 'daily')

  const canView = canViewTeamLeaderData(viewer)
  const canPickTl = canSelectTeamLeader(viewer)
  const tl = teamLeaders.find((t) => t.id === selectedTlId)

  // A Team Leader must always see THEIR OWN record, regardless of whichever
  // team leader Management/HOD last had selected in this shared context —
  // otherwise a Team Leader could land on this tab showing someone else's
  // data. Scoped to isTeamLeader specifically (not "!canPickTl" generally):
  // a plain Admin has no "own" record to fall back to — they simply see
  // nothing, per canView below.
  useEffect(() => {
    if (isTeamLeader(viewer)) setSelectedTlId(viewer.profileId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.role, viewer.hasTeamRow, viewer.profileId])

  const canSource = canEnterSourceData(viewer)
  const canKpi = canEnterKpiActual(viewer)
  const canMgrWeekly = canEnterManagerWeekly(viewer)
  const canVerify = canVerifyKpi(viewer)

  if (!canView) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <Lock className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <h2 className={sectionTitleCls}>No team leader data to show</h2>
        <p className={`${mutedTextCls} mt-1 max-w-md mx-auto`}>
          Each team leader&apos;s Data Entry is private to them. This account isn&apos;t a team leader, so
          there is nothing here to view — ask Management if you need access to a specific team leader&apos;s
          record.
        </p>
      </div>
    )
  }

  if (!tl) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <p className={mutedTextCls}>
          {realDataError ?? (realDataLoading ? 'Loading team leaders…' : 'No team leader record to show for this account.')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Context selectors ── */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls} htmlFor="de-tl">Team leader</label>
          {canPickTl ? (
            <select
              id="de-tl"
              value={selectedTlId}
              onChange={(e) => setSelectedTlId(e.target.value)}
              className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]"
            >
              {teamLeaders.map((t) => <option key={t.id} value={t.id}>{t.full_name} — {t.team}</option>)}
            </select>
          ) : (
            <p className="text-sm px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300">
              {tl.full_name} — {tl.team} <span className="text-gray-400 dark:text-gray-500">(you)</span>
            </p>
          )}
        </div>

        {section === 'kpi' && (
          <div>
            <label className={labelCls} htmlFor="de-month">Month</label>
            <select
              id="de-month"
              value={selectedManagerMonth}
              onChange={(e) => setSelectedManagerMonth(e.target.value)}
              className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]"
            >
              {managerMonths.map((m) => <option key={m} value={m}>{m.slice(0, 7)}</option>)}
            </select>
          </div>
        )}

        {(section === 'daily' || section === 'time_motion') && (
          <div>
            <label className={labelCls} htmlFor="de-date">Date</label>
            <input
              id="de-date"
              type="date"
              value={selectedDate}
              min={weekStarts[weekStarts.length - 1]}
              max={todayDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]"
            />
          </div>
        )}
      </div>

      {/* ── Section tabs (only worth showing when there is more than one) ── */}
      {sections.length > 1 && (
      <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1 w-fit max-w-full overflow-x-auto">
        {sections.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            aria-current={section === key ? 'page' : undefined}
            className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              section === key ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </div>
      )}

      {section === 'daily' && activityLoading && (
        <div className={`${cardCls} p-8 text-center`}><p className={mutedTextCls}>Loading activity…</p></div>
      )}
      {section === 'daily' && !activityLoading && activityError && (
        <div className={`${cardCls} p-8 text-center`}><p className={mutedTextCls}>{activityError}</p></div>
      )}
      {section === 'daily' && !activityLoading && !activityError && (
        <div className="space-y-6">
          <DailySection key={`${tl.id}-${selectedDate}`} tlId={tl.id} tlName={tl.full_name} canEdit={canSource} />
          <WeeklySection
            key={`${tl.id}-${selectedWeekStart}`}
            tlId={tl.id}
            tlName={tl.full_name}
            canEditTlFields={canSource}
            canEditManagerFields={canMgrWeekly}
          />
        </div>
      )}
      {/* TimeMotionSection reads the stored day — and checks a device draft against the roster's template — once at
          mount: never mount it before the day AND this date's roster shift have loaded (the shift of the previous
          date is still in the provider until then), or after the day failed to load. */}
      {section === 'time_motion' && timeMotionLoading && (
        <div className={`${cardCls} p-8 text-center`}><p className={mutedTextCls}>Loading Time & Motion…</p></div>
      )}
      {section === 'time_motion' && !timeMotionLoading && plannerError && (
        <div className={`${cardCls} p-8 text-center`}><p className={mutedTextCls}>{plannerError}</p></div>
      )}
      {section === 'time_motion' && !timeMotionLoading && !plannerError && (
        <TimeMotionSection key={`${tl.id}-${selectedDate}`} tlId={tl.id} tlName={tl.full_name} canEdit={canSource} />
      )}
      {section === 'kpi' && (
        <KpiActualsSection
          tlId={tl.id}
          tlName={tl.full_name}
          derivedValues={derivedValues}
          canEnterActual={canKpi}
          canVerify={canVerify}
        />
      )}
    </div>
  )
}
