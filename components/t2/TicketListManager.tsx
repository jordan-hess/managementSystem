'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { TicketWithNames } from '@/lib/t2/types'
import { SlaResult } from '@/lib/t2/sla'
import { StatusBadge, SlaChip } from './Badges'
import CreateTicketModal from './CreateTicketModal'

interface Props {
  tickets: (TicketWithNames & { sla: SlaResult })[]
  canCreate?: boolean
  customers?: { id: string; name: string; phone: string }[]
}

const STATUS_TABS = ['all', 'open', 'in_progress', 'escalated', 'awaiting_t3', 't3_responded', 'resolved', 'closed'] as const
const QUEUES = ['all', 'ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING'] as const

export default function TicketListManager({ tickets, canCreate = false, customers = [] }: Props) {
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_TABS)[number]>('all')
  const [queueFilter, setQueueFilter] = useState<(typeof QUEUES)[number]>('all')
  const [showCreate, setShowCreate] = useState(false)

  const filtered = tickets.filter((t) => {
    const statusMatch = statusFilter === 'all' ? t.status !== 'closed' : t.status === statusFilter
    const queueMatch = queueFilter === 'all' || t.queue === queueFilter
    return statusMatch && queueMatch
  })

  const breachedCount = tickets.filter((t) => t.status !== 'closed' && (t.sla.response.breached || t.sla.resolution.breached)).length

  return (
    <div>
      {showCreate && <CreateTicketModal onClose={() => setShowCreate(false)} customers={customers} />}
      {canCreate && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
            + New Ticket
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {breachedCount > 0 && (
            <span className="text-sm font-medium text-red-600 dark:text-red-400">
              {breachedCount} SLA breach{breachedCount === 1 ? '' : 'es'}
            </span>
          )}
          <select
            value={queueFilter}
            onChange={(e) => setQueueFilter(e.target.value as (typeof QUEUES)[number])}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {QUEUES.map((q) => (
              <option key={q} value={q}>{q === 'all' ? 'All queues' : q}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {['Ticket', 'Customer', 'Queue', 'Issue', 'Status', 'SLA', 'Assigned to', 'Created'].map((h) => (
                <th key={h} className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2">
                  <Link href={`/t2/${t.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                    {t.ticket_number}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                  {t.customer_name ? `${t.customer_name} — ${t.customer_phone}` : <span className="text-gray-400 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{t.queue}</td>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{t.issue_type}</td>
                <td className="px-4 py-2"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-2"><SlaChip sla={t.sla} status={t.status} /></td>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{t.assigned_to_name ?? '—'}</td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-500">
                  {format(new Date(t.created_at.replace(' ', 'T') + 'Z'), 'MMM d, HH:mm')}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-gray-600">No tickets match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
