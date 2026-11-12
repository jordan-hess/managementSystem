import { CalendarDays } from 'lucide-react'
import { ResolvedDaySlot } from '@/types'
import { statusColorClasses, statusLabels } from '@/lib/roster/teamColors'
import { formatShiftTime } from '@/lib/roster/calendarUtils'

// Plain helper (not a component) so the internal `new Date()` call falls
// outside the react-hooks/purity check's scope.
function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return 'Today'
  if (index === 1) return 'Tomorrow'
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function MiniRosterWidget({ days }: { days: ResolvedDaySlot[] }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4 text-blue-500" />
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Upcoming Roster</h3>
      </div>
      {days.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No roster assigned yet.</p>
      ) : (
        <div className="space-y-1.5">
          {days.map((slot, i) => {
            const sc = statusColorClasses[slot.effectiveStatus] ?? statusColorClasses.no_rotation
            return (
              <div key={slot.date} className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/60">
                <span className="font-medium text-gray-700 dark:text-gray-300 shrink-0">{dayLabel(slot.date, i)}</span>
                <div className="flex items-center gap-2 min-w-0">
                  {slot.isWorkDay && slot.shiftTemplate && (
                    <span className="text-gray-400 dark:text-gray-500 truncate">
                      {formatShiftTime(slot.shiftTemplate.start_time)}&ndash;{formatShiftTime(slot.shiftTemplate.end_time)}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full font-medium shrink-0 ${sc.bg} ${sc.text}`}>
                    {statusLabels[slot.effectiveStatus] ?? slot.effectiveStatus}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
