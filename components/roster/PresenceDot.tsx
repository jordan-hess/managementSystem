import { PresenceInfo } from '@/lib/roster/presence'

const DOT_CLASSES: Record<PresenceInfo['status'], string> = {
  not_scheduled: 'bg-gray-300 dark:bg-gray-600',
  offline_upcoming: 'bg-gray-400 dark:bg-gray-500',
  offline_overdue: 'bg-red-500',
  active_on_time: 'bg-green-500',
  active_late: 'bg-amber-500',
  on_break: 'bg-orange-500',
  in_meeting: 'bg-purple-500',
  inactive: 'bg-gray-400',
}

function buildTitle(info: PresenceInfo): string {
  switch (info.status) {
    case 'not_scheduled': return 'Not scheduled today'
    case 'offline_upcoming': return `Not logged in yet — due at ${info.expectedTime}`
    case 'offline_overdue': return `Not logged in — was due at ${info.expectedTime}`
    case 'active_on_time': return `Logged in on time (due ${info.expectedTime})`
    case 'active_late': return `Logged in late (due ${info.expectedTime})`
    case 'on_break': return 'On a break'
    case 'in_meeting': return 'In a meeting'
    case 'inactive': return 'Inactive'
  }
}

/** Small presence indicator: a colored dot (amber for a late login). Shown
 *  on the Manager/TL team board and the roster grid. */
export default function PresenceDot({ info }: { info: PresenceInfo }) {
  return (
    <span className="inline-flex items-center gap-1" title={buildTitle(info)}>
      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT_CLASSES[info.status]}`} />
    </span>
  )
}
