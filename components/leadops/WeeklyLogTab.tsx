'use client'

import { Loader2 } from 'lucide-react'
import { cardCls, mutedTextCls, sectionTitleCls, tableHeadCls } from '@/components/reports/theme'
import { weeklyRollupFromDaily } from '@/lib/leadops/rollups'
import { useLeadOpsData } from './LeadOpsDataProvider'
import { badgeCls, labelCls } from './statusStyles'

/**
 * Weekly Activity Log — HOD's READ-ONLY view across every team leader.
 * Calibration attended and re-audits completed are what Data Entry actually
 * captures; coaching sessions / agent-in-seat / critical fails are rolled up
 * from Daily Activity (lib/leadops/rollups.ts), not re-entered here. Team
 * leaders, the manager and the weeks all come from real data.
 */
export default function WeeklyLogTab() {
  const {
    dailyLogs, weeklyLogs, managerLogs, selectedWeekStart, setSelectedWeekStart, weekStarts,
    teamLeaders, people, peopleError, activityLoading, activityError,
  } = useLeadOpsData()
  const managerLog = people ? managerLogs.find((m) => m.manager_id === people.managerId && m.week_of === selectedWeekStart) : undefined

  if (activityLoading) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <Loader2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3 animate-spin" />
        <p className={mutedTextCls}>Loading weekly activity…</p>
      </div>
    )
  }
  if (activityError) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <p className={mutedTextCls}>{activityError}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className={labelCls} htmlFor="weekly-week">Week commencing</label>
          <select
            id="weekly-week"
            value={selectedWeekStart}
            onChange={(e) => setSelectedWeekStart(e.target.value)}
            className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]"
          >
            {weekStarts.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <p className={`${mutedTextCls} max-w-md text-right`}>Entered on Data Entry — this view is read-only.</p>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className={sectionTitleCls}>Team leader weekly log</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className={tableHeadCls}>
                <th className="px-4 py-2.5">Team leader</th>
                <th className="px-4 py-2.5">Calibration attended</th>
                <th className="px-4 py-2.5">Coaching sessions</th>
                <th className="px-4 py-2.5">Agent-in-seat days</th>
                <th className="px-4 py-2.5">Critical fails</th>
                <th className="px-4 py-2.5">Re-audits</th>
              </tr>
            </thead>
            <tbody>
              {teamLeaders.map((tl) => {
                const log = weeklyLogs.find((l) => l.tl_id === tl.id && l.week_of === selectedWeekStart)
                const rollup = weeklyRollupFromDaily(dailyLogs, tl.id, selectedWeekStart)
                if (!log) {
                  return (
                    <tr key={tl.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-2.5 text-gray-900 dark:text-white">{tl.full_name}</td>
                      <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500" colSpan={5}>Not submitted for this week.</td>
                    </tr>
                  )
                }
                return (
                  <tr key={tl.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2.5">
                      <div className="text-gray-900 dark:text-white font-medium">{tl.full_name}</div>
                      <div className={mutedTextCls}>{tl.team} team</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`${badgeCls} ${log.calibration ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                        {log.calibration ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{rollup.coachingSessions}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{rollup.agentInSeatDays}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{rollup.criticalFails}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{log.re_audits}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${cardCls} p-5 space-y-3`}>
        <div>
          <h2 className={sectionTitleCls}>Manager weekly log</h2>
          <p className={mutedTextCls}>{people ? `${people.managerName} · week of ${selectedWeekStart}` : `Week of ${selectedWeekStart}`}</p>
        </div>
        {!people ? (
          // Without the configured manager there is nothing to look up: say so, rather than
          // implying the manager simply has not submitted.
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Manager not configured</p>
            <p className={`${mutedTextCls} mt-0.5`}>{peopleError ?? 'The manager for this log could not be determined.'}</p>
          </div>
        ) : !managerLog ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Not submitted for this week.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <span className={labelCls}>Interactions sampled</span>
              <p className="text-gray-900 dark:text-white font-medium">{managerLog.interactions_sampled}</p>
            </div>
            <div>
              <span className={labelCls}>TL 1:1s held</span>
              <p className="text-gray-900 dark:text-white font-medium">{managerLog.tl_one_on_ones}</p>
            </div>
            <div>
              <span className={labelCls}>Calibration spot-check attended</span>
              <span className={`${badgeCls} ${managerLog.calibration_spot_check ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                {managerLog.calibration_spot_check ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
