import { Profile, ResolvedDaySlot } from '@/types'
import { formatDateKey, isToday } from '@/lib/roster/calendarUtils'
import { attendanceColorClasses } from '@/lib/roster/attendanceColors'
import { statusLabels } from '@/lib/roster/teamColors'
import { teamGroupColorClasses, teamGroupLabels } from '@/lib/roster/teamGroupColors'
import { ShiftRosterEntry } from '@/lib/roster/shiftAggregation'
import ShiftHoverCard from './ShiftHoverCard'

type GroupableProfile = Pick<Profile, 'id' | 'full_name'>

interface Props {
  weekDates: Date[]
  agentsByGroup: { social: GroupableProfile[]; t2: GroupableProfile[] }
  slotMap: Map<string, ResolvedDaySlot>
  shiftRosterMap: Map<string, ShiftRosterEntry[]>
}

const DAY_SHORT: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' }
const GROUP_ORDER: ('social' | 't2')[] = ['social', 't2']

/**
 * Replaces WeekView.tsx as the sole agent-facing view — fixed to the
 * current week (no Month/Week/Day toggle), grouped by Social/T2 instead of
 * the legacy 4 named teams, hover-driven shift detail instead of a click
 * drill-down. Reads generic "on shift" for colleagues and a viewer's own
 * real status for themself purely as a consequence of the server-side
 * attendance scoping in app/(app)/roster/page.tsx — no extra hiding logic
 * needed here.
 */
export default function RosterWeekBoard({ weekDates, agentsByGroup, slotMap, shiftRosterMap }: Props) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-800">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-44">Agent</th>
            {weekDates.map(day => {
              const today = isToday(day)
              return (
                <th key={formatDateKey(day)} className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{DAY_SHORT[day.getDay()]}</span>
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${today ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                      {day.getDate()}
                    </span>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {GROUP_ORDER.map(group => {
            const agents = agentsByGroup[group]
            const colors = teamGroupColorClasses[group]
            return (
              <>
                <tr key={`header-${group}`} className={colors.lightBg}>
                  <td colSpan={8} className="px-4 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                      <span className={`text-xs font-semibold uppercase tracking-wide ${colors.text}`}>{teamGroupLabels[group]}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">· {agents.length}</span>
                    </div>
                  </td>
                </tr>
                {agents.length === 0 ? (
                  <tr key={`empty-${group}`}>
                    <td colSpan={8} className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                      No {teamGroupLabels[group].toLowerCase()} agents yet.
                    </td>
                  </tr>
                ) : agents.map(profile => (
                  <tr key={profile.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 ${colors.bg}`}>
                          {profile.full_name.charAt(0)}
                        </div>
                        <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{profile.full_name}</span>
                      </div>
                    </td>
                    {weekDates.map(day => {
                      const dateStr = formatDateKey(day)
                      const slot = slotMap.get(`${profile.id}:${dateStr}`)
                      const sc = slot ? (attendanceColorClasses[slot.effectiveStatus] ?? attendanceColorClasses.off) : attendanceColorClasses.off
                      const shiftAgents = slot?.shiftTemplate ? shiftRosterMap.get(`${dateStr}:${slot.shiftTemplate.id}`) ?? [] : []

                      return (
                        <td key={dateStr} className="px-1 py-1.5 text-center">
                          {slot ? (
                            <div className={`w-full rounded px-1 py-1 text-xs font-medium ${sc.bg} ${sc.text}`}>
                              <div>{statusLabels[slot.effectiveStatus]}</div>
                              {slot.shiftTemplate && slot.isWorkDay && (
                                <ShiftHoverCard shiftTemplate={slot.shiftTemplate} agents={shiftAgents} />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
