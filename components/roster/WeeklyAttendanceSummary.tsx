import { ResolvedDaySlot } from '@/types'
import { formatDateKey, isToday } from '@/lib/roster/calendarUtils'
import { attendanceColorClasses, attendanceIcons, attendanceLegend, ANOMALY_STATUSES } from '@/lib/roster/attendanceColors'
import { statusLabels } from '@/lib/roster/teamColors'

const DAY_SHORT: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' }

interface Props {
  weekDates: Date[]
  profiles: { id: string; full_name: string }[]
  slotMap: Map<string, ResolvedDaySlot>
  /** Omitted → view-only: cells render as plain (non-interactive) status
   *  chips instead of buttons. Team leaders currently have view-only
   *  access to the roster (see RosterManager.tsx) — attendance editing
   *  stays admin/management-only. */
  onCellClick?: (profileId: string, date: string) => void
}

/**
 * Team-leader-only anomaly view — late/sick/absent/other for their own
 * team's agents this week. Not shown to plain agents or rendered for
 * admin/management, who keep their existing attendance access entirely
 * inside the untouched RosterGridView.
 */
export default function WeeklyAttendanceSummary({ weekDates, profiles, slotMap, onCellClick }: Props) {
  if (profiles.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Weekly Attendance</h3>
        <div className="flex items-center gap-3 flex-wrap">
          {attendanceLegend.map(({ status, label }) => {
            const Icon = attendanceIcons[status]
            const sc = attendanceColorClasses[status]
            return (
              <span key={status} className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${sc.bg} ${sc.text}`}>
                {Icon && <Icon className="w-3 h-3" />} {label}
              </span>
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="text-left px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-36">Agent</th>
              {weekDates.map(day => (
                <th key={formatDateKey(day)} className={`text-center px-1 py-1.5 text-xs font-semibold uppercase tracking-wide ${isToday(day) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {DAY_SHORT[day.getDay()]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {profiles.map(profile => (
              <tr key={profile.id}>
                <td className="px-2 py-1.5 text-xs font-medium text-gray-900 dark:text-white truncate">{profile.full_name}</td>
                {weekDates.map(day => {
                  const dateStr = formatDateKey(day)
                  const slot = slotMap.get(`${profile.id}:${dateStr}`)
                  const status = slot?.effectiveStatus
                  const isAnomaly = status && (ANOMALY_STATUSES as readonly string[]).includes(status)
                  const Icon = isAnomaly ? attendanceIcons[status] : undefined
                  const sc = isAnomaly ? attendanceColorClasses[status] : null
                  const chip = Icon ? <Icon className="w-3.5 h-3.5" /> : <span className="text-gray-300 dark:text-gray-600">—</span>
                  return (
                    <td key={dateStr} className="px-1 py-1 text-center">
                      {onCellClick ? (
                        <button
                          type="button"
                          onClick={() => onCellClick(profile.id, dateStr)}
                          title={isAnomaly ? `${profile.full_name} — ${statusLabels[status] ?? status} — click to edit` : `${profile.full_name} — click to mark attendance`}
                          className={`w-7 h-7 mx-auto flex items-center justify-center rounded transition-opacity hover:opacity-75 ${sc ? `${sc.bg} ${sc.text}` : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                        >
                          {chip}
                        </button>
                      ) : (
                        <div
                          title={isAnomaly ? `${profile.full_name} — ${statusLabels[status] ?? status}` : profile.full_name}
                          className={`w-7 h-7 mx-auto flex items-center justify-center rounded ${sc ? `${sc.bg} ${sc.text}` : ''}`}
                        >
                          {chip}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
