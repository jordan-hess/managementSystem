import { AlertTriangle } from 'lucide-react'
import { ActiveAssistanceRecord, ActiveAssistanceSource } from '@/types'

const SOURCE_TYPE_LABEL: Record<ActiveAssistanceSource, string> = {
  support_ticket: 'Support Ticket',
  followup: 'Follow-up',
  callback: 'Callback',
  t2_ticket: 'T2 Ticket',
}

interface Props {
  records: ActiveAssistanceRecord[]
  variant?: 'banner' | 'badge'
  /** Omit the record for whatever ticket is currently being viewed (e.g. a ticket's own detail page). */
  excludeSourceId?: string
  className?: string
}

export default function ActiveAssistanceBanner({ records, variant = 'banner', excludeSourceId, className }: Props) {
  const visible = excludeSourceId ? records.filter(r => r.sourceId !== excludeSourceId) : records
  if (visible.length === 0) return null

  if (variant === 'badge') {
    return (
      <span
        title={visible.map(r => `${r.agentName ?? 'Unknown agent'} — ${r.queueOrChannel ?? SOURCE_TYPE_LABEL[r.sourceType]} (${r.status})`).join('\n')}
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 ${className ?? ''}`}
      >
        <AlertTriangle className="w-3 h-3" /> Active{visible.length > 1 ? ` ×${visible.length}` : ''}
      </span>
    )
  }

  return (
    <div className={`rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3 ${className ?? ''}`}>
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Customer currently being assisted{visible.length > 1 ? ` (${visible.length} active workstreams)` : ''}
      </div>
      {visible.map(r => (
        <div key={`${r.sourceType}-${r.sourceId}`} className="rounded-lg bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-900 px-3 py-2 text-sm">
          <p className="text-gray-900 dark:text-white">
            by <span className="font-medium">{r.agentName ?? 'Unknown agent'}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({SOURCE_TYPE_LABEL[r.sourceType]})</span>
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Queue: {r.queueOrChannel ?? '—'} · Status: {r.status} · Ticket: {r.ticketLabel}
          </p>
        </div>
      ))}
    </div>
  )
}
