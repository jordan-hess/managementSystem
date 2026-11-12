'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { TicketHistoryRecord } from '@/types'
import { AnyQueue, EXTENDED_QUEUES } from '@/lib/queues/constants'
import { QUEUES } from '@/lib/t2/constants'
import DateRangeCalendar from './DateRangeCalendar'
import { statusBadgeClass, TICKET_STATUS_BUCKETS } from './statusBadges'
import { DEPARTMENTS, groupAgentsByDepartment } from '@/lib/departments'

const SOCIAL_QUEUE_OPTIONS: { value: AnyQueue; label: string }[] = [
  { value: 'freescout', label: 'Freescout' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'hellopeter', label: 'HelloPeter' },
  { value: 'mybroadband', label: 'MyBroadband' },
  { value: 'pissedcustomer', label: 'PissedCustomer' },
]

const STATUS_GROUPS = ['active', 'resolved', 'all'] as const

interface Props {
  rows: TicketHistoryRecord[]
  totalCount: number
  page: number
  pageSize: number
  queue: string
  statusGroup: string
  nativeStatus: string
  mine: boolean
  privileged: boolean
  agentOptions: { id: string; full_name: string; department?: string | null; t2_team?: string | null; team_department?: string | null }[]
  assignedAgentId: string
  /** 'YYYY-MM-DD' or '' — inclusive range on last-updated. */
  updatedFrom: string
  updatedTo: string
  /** Billing agents only ever work Billing tickets (their queue is pinned server-side too — see app/(app)/tickets/page.tsx) — there's nothing else for the queue picker to offer them. */
  hideQueueSelect?: boolean
}

/**
 * Thin renderer over getUnifiedTicketList's {rows, totalCount} — server-
 * fetched by app/(app)/tickets/page.tsx per the current URL filters, not
 * client-side filtering of a full dataset like the three legacy managers
 * did. Every control here changes the URL, which triggers the next server
 * fetch (Server Component re-render).
 */
export default function TicketListTable({
  rows, totalCount, page, pageSize, queue, statusGroup, nativeStatus, mine, privileged, agentOptions, assignedAgentId,
  updatedFrom, updatedTo, hideQueueSelect,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, value)
    }
    // Any filter change resets pagination — the old page number is
    // meaningless against a different result set.
    if (!('page' in updates)) params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function openTicket(row: TicketHistoryRecord) {
    // Every ticket type opens as an in-page modal now via ?source=&id= —
    // T2 tickets (Billing included) no longer navigate to /tickets/t2/[id].
    pushParams({ source: row.sourceType, id: row.sourceId })
  }

  function openCustomer(customerId: string | null) {
    if (!customerId) return
    pushParams({ customer: customerId })
  }

  const isSingleQueue = queue !== 'all'
  const nativeSource = isSingleQueue
    ? ((QUEUES as readonly string[]).includes(queue) || queue === 'BILLING' ? 't2_ticket' : 'support_ticket')
    : null

  const agentsByDepartment = groupAgentsByDepartment(agentOptions)

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {!hideQueueSelect && (
          <select
            value={queue}
            // Status buckets differ between All queues and a single queue,
            // so the old status tab can't carry across a queue change.
            onChange={(e) => pushParams({ queue: e.target.value, status: null })}
            title="Filter by queue"
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="all">All queues</option>
            <optgroup label="Social">
              {SOCIAL_QUEUE_OPTIONS.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
            </optgroup>
            <optgroup label="T2">
              {QUEUES.map((q) => <option key={q} value={q}>{q}</option>)}
            </optgroup>
            <optgroup label="Billing">
              <option value="BILLING">Billing</option>
            </optgroup>
            {/* Assignment-only for now — agents can be rostered onto these,
                but no ticket can be raised in one until
                support_tickets_channel_check is widened, so picking one
                here legitimately shows an empty list. */}
            <optgroup label="Other channels">
              {EXTENDED_QUEUES.map((q) => <option key={q} value={q}>{q}</option>)}
            </optgroup>
          </select>
        )}

        <DateRangeCalendar
          from={updatedFrom}
          to={updatedTo}
          onChange={(next) => pushParams(next)}
        />
      </div>

      {/* Second row keeps the filter bar from wrapping awkwardly once the
          date inputs are in play. */}
      <div className="flex flex-wrap items-center gap-3">

        <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
          {isSingleQueue && nativeSource
            ? [{ key: '', label: 'All' }, ...TICKET_STATUS_BUCKETS].map((b) => (
                <button
                  key={b.key || 'all'}
                  onClick={() => pushParams({ status: nativeStatus === b.key ? null : b.key || null })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    nativeStatus === b.key ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >{b.label}</button>
              ))
            : STATUS_GROUPS.map((s) => (
                <button
                  key={s}
                  onClick={() => pushParams({ status: s })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                    statusGroup === s ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >{s}</button>
              ))}
        </div>

        {privileged && (
          <>
            <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
              <button
                onClick={() => pushParams({ mine: null, agent: null })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  !mine && !assignedAgentId ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >All agents</button>
              <button
                onClick={() => pushParams({ mine: 'true', agent: null })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mine ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >Mine</button>
            </div>
            {agentOptions.length > 0 && (
              <select
                value={assignedAgentId}
                onChange={(e) => pushParams({ agent: e.target.value || null, mine: null })}
                title="Filter by assigned agent"
                className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">Any agent</option>
                {DEPARTMENTS.map((d) => agentsByDepartment[d].length > 0 && (
                  <optgroup key={d} label={d}>
                    {agentsByDepartment[d].map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
          </>
        )}

        <div className="flex-1" />
        <span className="text-xs text-gray-400 dark:text-gray-500">{totalCount} ticket{totalCount === 1 ? '' : 's'}</span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 py-16 text-center">
          <Inbox className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No tickets found</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 shadow-sm">
          {rows.map((row) => (
            <div key={`${row.sourceType}-${row.sourceId}`} className="px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors flex items-center justify-between gap-3">
              <button onClick={() => openTicket(row)} title="Open this ticket" className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 mb-0.5">
                  {row.customerId ? (
                    <span
                      role="link"
                      onClick={(e) => { e.stopPropagation(); openCustomer(row.customerId) }}
                      title="View this customer's history"
                      className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                    >
                      {row.customerName ?? 'Unknown customer'}
                    </span>
                  ) : (
                    // A manual callback has no customer record to open: plain text, so the click opens the ticket.
                    <span className="font-medium text-gray-900 dark:text-white">
                      {row.customerName ?? 'Unknown customer'}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500">{row.ticketLabel}</span>
                  {row.queueOrChannel && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">
                      {row.queueOrChannel}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {row.agentName ?? 'Unassigned'} · updated {format(new Date(row.updatedAt), 'dd MMM yyyy HH:mm')}
                </p>
              </button>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(row.sourceType, row.status)}`}>
                {row.status.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => pushParams({ page: String(page - 1) })}
            disabled={page <= 0}
            title="Previous page"
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => pushParams({ page: String(page + 1) })}
            disabled={page + 1 >= totalPages}
            title="Next page"
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
