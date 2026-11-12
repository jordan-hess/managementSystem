import { Profile, ResolvedDaySlot } from '@/types'
import { formatDateKey, isSameMonth, isToday, formatShiftTime } from '@/lib/roster/calendarUtils'
import { attendanceColorClasses, shiftTimeColorClasses } from '@/lib/roster/attendanceColors'
import { statusLabels } from '@/lib/roster/teamColors'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  currentDate: Date
  monthGridDays: Date[]
  profile: Pick<Profile, 'id'>
  slotMap: Map<string, ResolvedDaySlot>
  onNavigate: (dir: -1 | 1) => void
  onToday: () => void
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * A plain agent's own month calendar — fully personal, no other agents'
 * names, teams, or schedules shown (per explicit correction: agents should
 * not see all teams). Each day shows the viewer's own shift (if a work day)
 * and their own attendance status, colored via attendanceColorClasses.
 * Team leaders keep the broader Social/T2 board + weekly attendance summary
 * (components/roster/RosterWeekBoard.tsx, WeeklyAttendanceSummary.tsx) —
 * this restriction is agent-role-only.
 */
export default function AgentMonthCalendar({ currentDate, monthGridDays, profile, slotMap, onNavigate, onToday }: Props) {
  const monthLabel = currentDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => onNavigate(-1)} title="Previous month" className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onToday} title="Jump to today" className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Today
          </button>
          <button onClick={() => onNavigate(1)} title="Next month" className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide py-1">{d}</div>
        ))}
        {monthGridDays.map(day => {
          const dateStr = formatDateKey(day)
          const inMonth = isSameMonth(day, currentDate.getFullYear(), currentDate.getMonth())
          const slot = inMonth ? slotMap.get(`${profile.id}:${dateStr}`) : undefined
          const sc = !slot
            ? null
            : slot.effectiveStatus === 'on_shift' && slot.shiftTemplate
              ? shiftTimeColorClasses(slot.shiftTemplate.is_late_shift)
              : (attendanceColorClasses[slot.effectiveStatus] ?? attendanceColorClasses.off)
          const today = isToday(day)

          return (
            <div
              key={dateStr}
              className={`rounded-lg p-1.5 min-h-16 border ${today ? 'border-blue-400 dark:border-blue-600' : 'border-gray-100 dark:border-gray-800'} ${inMonth ? '' : 'opacity-40'}`}
            >
              <div className={`text-xs font-medium mb-1 ${today ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {day.getDate()}
              </div>
              {slot && sc && (
                <div className={`rounded px-1 py-0.5 text-xs font-medium ${sc.bg} ${sc.text}`}>
                  <div>{statusLabels[slot.effectiveStatus] ?? slot.effectiveStatus}</div>
                  {slot.shiftTemplate && slot.isWorkDay && (
                    <div className="opacity-70 text-[10px] mt-0.5">{formatShiftTime(slot.shiftTemplate.start_time)}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
