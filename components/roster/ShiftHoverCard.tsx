import { ShiftTemplate } from '@/types'
import { formatShiftTime } from '@/lib/roster/calendarUtils'
import { getGroupColorKey } from '@/lib/roster/teamGroups'
import { teamGroupColorClasses } from '@/lib/roster/teamGroupColors'
import { ShiftRosterEntry } from '@/lib/roster/shiftAggregation'
import HoverPopover from './HoverPopover'

interface Props {
  shiftTemplate: ShiftTemplate
  agents: ShiftRosterEntry[]
}

export default function ShiftHoverCard({ shiftTemplate, agents }: Props) {
  const groupKey = getGroupColorKey(agents.map(a => a.group))
  const colors = teamGroupColorClasses[groupKey]
  const timeRange = `${formatShiftTime(shiftTemplate.start_time)} – ${formatShiftTime(shiftTemplate.end_time)}`

  return (
    <HoverPopover
      trigger={
        <div
          title={`${shiftTemplate.name} — ${timeRange} — ${agents.length} agent${agents.length === 1 ? '' : 's'}`}
          className={`text-xs opacity-80 mt-0.5 border-l-2 pl-1 ${colors.border}`}
        >
          {timeRange}
        </div>
      }
    >
      <div className="space-y-2">
        <div className="pb-1.5 border-b border-gray-100 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{shiftTemplate.name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{timeRange}</p>
        </div>
        {agents.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">No agents assigned.</p>
        ) : (
          <ul className="space-y-1">
            {agents.map(a => (
              <li key={a.profileId} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${teamGroupColorClasses[a.group].dot}`} />
                {a.full_name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </HoverPopover>
  )
}
