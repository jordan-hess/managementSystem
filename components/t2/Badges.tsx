// T2 Queue Hub merge — ported from t2-queue-hub/frontend/src/components/Badges.jsx,
// restyled with Tailwind classes (T2's original used plain CSS classes
// badge/sla-chip defined in frontend/src/styles.css) to match CMS conventions.

import { SlaResult, SlaWindow } from '@/lib/t2/sla'
import { TicketStatus } from '@/lib/t2/types'

const statusStyles: Record<TicketStatus, string> = {
  open:          'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  in_progress:   'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  escalated:     'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
  awaiting_t3:   'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
  t3_responded:  'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400',
  resolved:      'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  closed:        'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  callback:      'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function fmtMinutes(m: number): string {
  const abs = Math.abs(m)
  const h = Math.floor(abs / 60)
  const mm = Math.round(abs % 60)
  return `${m < 0 ? '-' : ''}${h}h ${mm}m`
}

function windowChip(window: SlaWindow, label: string) {
  let cls = 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
  if (window.breached) cls = 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
  else if (window.remaining_minutes < window.target_minutes * 0.25)
    cls = 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>
      {label}: {window.breached ? `+${fmtMinutes(window.elapsed_minutes - window.target_minutes)} over` : `${fmtMinutes(window.remaining_minutes)} left`}
    </span>
  )
}

/** Compact single chip for list rows: shows whichever window is more urgent. */
export function SlaChip({ sla, status }: { sla: SlaResult; status: TicketStatus }) {
  if (status === 'closed') return <span className="text-gray-400 dark:text-gray-600 text-xs">—</span>
  if (!sla.response.met && !sla.response.breached) return windowChip(sla.response, 'Response')
  return windowChip(sla.resolution, 'Resolution')
}

/** Full response + resolution pair, for the ticket detail page. */
export function SlaPanel({ sla }: { sla: SlaResult }) {
  return (
    <div className="flex flex-wrap gap-2">
      {windowChip(sla.response, 'Response')}
      {windowChip(sla.resolution, 'Resolution')}
    </div>
  )
}
