import { ResolvedDaySlot, TeamGroup } from '@/types'
import { teamGroupColorClasses, teamGroupLabels } from '@/lib/roster/teamGroupColors'
import { attendanceColorClasses } from '@/lib/roster/attendanceColors'
import { statusLabels } from '@/lib/roster/teamColors'
import HoverPopover from './HoverPopover'
import { Users } from 'lucide-react'

interface Props {
  group: TeamGroup
  agents: { id: string; full_name: string }[]
  slotMap: Map<string, ResolvedDaySlot>
  todayDateStr: string
}

export default function TeamGroupBadge({ group, agents, slotMap, todayDateStr }: Props) {
  const colors = teamGroupColorClasses[group]
  const label = teamGroupLabels[group]

  return (
    <HoverPopover
      align="left"
      trigger={
        <div
          title={`${label} — ${agents.length} active agent${agents.length === 1 ? '' : 's'}`}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colors.border} ${colors.lightBg} cursor-default`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <span className={`text-sm font-semibold ${colors.text}`}>{label}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">· {agents.length}</span>
        </div>
      }
    >
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 pb-1.5 border-b border-gray-100 dark:border-gray-800">
          <Users className="w-3.5 h-3.5 text-gray-400" />
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label} · {agents.length} active</p>
        </div>
        {agents.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">No {label.toLowerCase()} agents yet.</p>
        ) : (
          <ul className="space-y-1">
            {agents.map(a => {
              const slot = slotMap.get(`${a.id}:${todayDateStr}`)
              const status = slot?.effectiveStatus ?? 'no_rotation'
              const sc = attendanceColorClasses[status] ?? attendanceColorClasses.no_rotation
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{a.full_name}</span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${sc.bg} ${sc.text}`}>{statusLabels[status] ?? status}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </HoverPopover>
  )
}
