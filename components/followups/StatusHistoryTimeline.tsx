'use client'

import { FollowupStatusHistory } from '@/types'
import { format } from 'date-fns'

interface Props {
  items: FollowupStatusHistory[]
}

const statusLabel: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const statusBadge: Record<string, string> = {
  open: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  in_progress: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  resolved: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  closed: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

export default function StatusHistoryTimeline({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">No status changes yet.</p>
  }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-2 text-xs">
          <span className={`px-1.5 py-0.5 rounded font-medium ${statusBadge[item.from_status]}`}>{statusLabel[item.from_status]}</span>
          <span className="text-gray-400">→</span>
          <span className={`px-1.5 py-0.5 rounded font-medium ${statusBadge[item.to_status]}`}>{statusLabel[item.to_status]}</span>
          <span className="text-gray-400 dark:text-gray-500">
            {item.profiles?.full_name ? `by ${item.profiles.full_name}, ` : ''}
            {format(new Date(item.changed_at), 'dd MMM yyyy HH:mm')}
          </span>
        </div>
      ))}
    </div>
  )
}
