'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { X, Phone, Mail, Hash, Edit2, Loader2 } from 'lucide-react'
import { getCustomerByIdAction } from '@/lib/customers/actions'
import { getTicketHistoryAction, getActiveAssistanceAction } from '@/lib/activeAssistance/actions'
import ActiveAssistanceBanner from '@/components/active-assistance/ActiveAssistanceBanner'
import CustomerFormModal from './CustomerFormModal'
import { statusBadgeClass } from './statusBadges'
import { ActiveAssistanceRecord, Customer, TicketHistoryRecord } from '@/types'

interface Props {
  customerId: string
  onClose: () => void
  onOpenTicket: (record: TicketHistoryRecord) => void
}

/**
 * Side panel (not a modal — see the Phase 2 plan's layout section: an agent
 * needs to reference a customer's history while simultaneously creating or
 * editing a ticket, which a modal dead-ends). Driven by the ?customer= URL
 * param so it's bookmarkable/shareable like every other list filter.
 */
export default function CustomerPanel({ customerId, onClose, onOpenTicket }: Props) {
  const [customer, setCustomer] = useState<(Customer & { profiles: { full_name: string } | null }) | null>(null)
  const [history, setHistory] = useState<TicketHistoryRecord[]>([])
  const [activeAssistance, setActiveAssistance] = useState<ActiveAssistanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    Promise.all([
      getCustomerByIdAction(customerId),
      getTicketHistoryAction(customerId),
      getActiveAssistanceAction(customerId),
    ]).then(([customerRes, historyRes, activeRes]) => {
      if (cancelled) return
      if (customerRes.error) setError(customerRes.error)
      else setCustomer(customerRes.data ?? null)
      if (historyRes.data) setHistory(historyRes.data)
      if (activeRes.data) setActiveAssistance(activeRes.data)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [customerId])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{customer?.name ?? 'Customer'}</h2>
          <div className="flex items-center gap-1 shrink-0">
            {customer && (
              <button onClick={() => setEditing(true)} title="Edit this customer" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg">
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} title="Close" className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{error}</p>
          ) : customer ? (
            <>
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300"><Phone className="w-3.5 h-3.5 text-gray-400" />{customer.phone}</p>
                {customer.email && <p className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300"><Mail className="w-3.5 h-3.5 text-gray-400" />{customer.email}</p>}
                {customer.account_number && <p className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300"><Hash className="w-3.5 h-3.5 text-gray-400" />{customer.account_number}</p>}
                {customer.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{customer.notes}</p>}
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Created by {customer.profiles?.full_name ?? 'Unknown'} on {format(new Date(customer.created_at), 'dd MMM yyyy')}
                </p>
              </div>

              <ActiveAssistanceBanner records={activeAssistance} variant="banner" />

              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">History ({history.length})</h3>
                {history.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No tickets yet.</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((h) => (
                      <button
                        key={`${h.sourceType}-${h.sourceId}`}
                        onClick={() => onOpenTicket(h)}
                        className="w-full text-left rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{h.ticketLabel}</p>
                            {h.queueOrChannel && <p className="text-xs text-gray-400 dark:text-gray-500">{h.queueOrChannel}</p>}
                            {h.issueType && (
                              <p className="text-xs text-gray-400 dark:text-gray-500">
                                {h.issueType}{h.rootCause ? ` · ${h.rootCause}` : ''}
                              </p>
                            )}
                          </div>
                          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(h.sourceType, h.status)}`}>
                            {h.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {h.agentName ?? 'Unassigned'} · {format(new Date(h.createdAt), 'dd MMM yyyy')}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {customer && (
        <CustomerFormModal
          open={editing}
          onClose={() => setEditing(false)}
          editing={customer}
          onSaved={(updated) => { setCustomer({ ...customer, ...updated }); setEditing(false) }}
        />
      )}
    </>
  )
}
