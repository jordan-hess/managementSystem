'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Plus, FileText, Phone, Search, Loader2 } from 'lucide-react'
import TicketListTable from './TicketListTable'
import CustomerPanel from './CustomerPanel'
import CreateTicketOrchestrator from './CreateTicketOrchestrator'
import FollowupModal from './FollowupModal'
import CallbackModal from './CallbackModal'
import SupportTicketModal from './SupportTicketModal'
import BillingStatusModal from './BillingStatusModal'
import T2TicketDetailModal from './T2TicketDetailModal'
import AssignFollowupModal from '@/components/followups/AssignFollowupModal'
import {
  getSupportTicketByIdAction, getFollowupByIdAction, getCallbackByIdAction, getFollowupHistoryAction,
} from '@/app/(app)/support-tickets/actions'
import { getTicketModalDataAction, type BillingTicketSummary, type TicketModalData } from '@/app/(app)/t2/actions'
import { searchCustomersAction, type CustomerSearchResult } from '@/lib/customers/search'
import {
  ActiveAssistanceSource, CaseCategory, Callback, FollowupAssignee, FollowupStatusHistory, Followup,
  SupportTicket, TicketHistoryRecord,
} from '@/types'

interface CustomerOption { id: string; name: string; phone: string; email?: string | null }
interface TeamLeaderCandidate { profile_id: string; profiles: (FollowupAssignee & { is_active: boolean }) | null }

interface Props {
  rows: TicketHistoryRecord[]
  totalCount: number
  page: number
  pageSize: number
  queue: string
  statusGroup: string
  nativeStatus: string
  mine: boolean
  assignedAgentId: string
  updatedFrom: string
  updatedTo: string
  privileged: boolean
  customers: CustomerOption[]
  agentCandidates: FollowupAssignee[]
  teamLeaderCandidates: TeamLeaderCandidate[]
  categories: CaseCategory[]
  callbackAgents: { id: string; full_name: string }[]
  userId: string
  isAdmin: boolean
  canAssign: boolean
  isBillingAgent: boolean
  // Department-scoped queue/channel options for the standalone Follow-up/
  // Callback modals — see lib/queues/followupQueueOptions.ts.
  followupQueueOptions: string[]
  initialCustomerId: string | null
  initialSource: ActiveAssistanceSource | null
  initialSourceId: string | null
}

const inputCls = 'w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'

export default function TicketsPageClient({
  rows, totalCount, page, pageSize, queue, statusGroup, nativeStatus, mine, assignedAgentId, updatedFrom, updatedTo, privileged,
  customers, agentCandidates, teamLeaderCandidates, categories, callbackAgents,
  userId, isAdmin, canAssign, isBillingAgent, followupQueueOptions, initialCustomerId, initialSource, initialSourceId,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [newTicketOpen, setNewTicketOpen] = useState(false)
  const [billingTicketOpen, setBillingTicketOpen] = useState(false)
  const [followupModal, setFollowupModal] = useState<{ open: boolean; editing: Followup | null; history: FollowupStatusHistory[] }>({ open: false, editing: null, history: [] })
  const [callbackModal, setCallbackModal] = useState<{ open: boolean; editing: Callback | null }>({ open: false, editing: null })
  const [supportTicketModal, setSupportTicketModal] = useState<{ open: boolean; editing: SupportTicket | null }>({ open: false, editing: null })
  const [billingStatusModal, setBillingStatusModal] = useState<{ open: boolean; ticket: BillingTicketSummary | null }>({ open: false, ticket: null })
  const [t2TicketModal, setT2TicketModal] = useState<{ open: boolean; data: Extract<TicketModalData, { kind: 't2' }>['data'] | null }>({ open: false, data: null })

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)

  function clearParams(keys: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    keys.forEach((k) => params.delete(k))
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname)
  }

  function openCustomer(customerId: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('customer', customerId)
    router.push(`${pathname}?${params.toString()}`)
  }

  function openTicketRecord(record: TicketHistoryRecord | { sourceType: ActiveAssistanceSource; sourceId: string }) {
    // Every ticket type opens as an in-page modal now via ?source=&id= —
    // T2 tickets (Billing included) no longer navigate to /tickets/t2/[id].
    const params = new URLSearchParams(searchParams.toString())
    params.set('source', record.sourceType)
    params.set('id', record.sourceId)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Deep link: ?source=&id= (from TicketListTable/CustomerPanel row clicks,
  // or a shared URL) fetches the one full record it needs and opens the
  // matching edit modal — the unified list itself only ever holds the
  // lighter TicketHistoryRecord shape (see getUnifiedTicketList.ts).
  useEffect(() => {
    if (!initialSource || !initialSourceId) return
    let cancelled = false

    if (initialSource === 'support_ticket') {
      getSupportTicketByIdAction(initialSourceId).then((res) => {
        if (!cancelled && res.data) setSupportTicketModal({ open: true, editing: res.data })
      })
    } else if (initialSource === 'followup') {
      Promise.all([getFollowupByIdAction(initialSourceId), getFollowupHistoryAction(initialSourceId)]).then(([fRes, hRes]) => {
        if (cancelled || !fRes.data) return
        setFollowupModal({ open: true, editing: fRes.data, history: hRes.data ?? [] })
      })
    } else if (initialSource === 'callback') {
      getCallbackByIdAction(initialSourceId).then((res) => {
        if (!cancelled && res.data) setCallbackModal({ open: true, editing: res.data })
      })
    } else if (initialSource === 't2_ticket') {
      // Covers every T2 queue including Billing — getTicketModalDataAction
      // inspects the ticket and returns whichever shape applies, since the
      // client doesn't know in advance which one a given id is.
      getTicketModalDataAction(initialSourceId).then((res) => {
        if (cancelled || !res.data) return
        if (res.data.kind === 'billing') setBillingStatusModal({ open: true, ticket: res.data.data })
        else setT2TicketModal({ open: true, data: res.data.data })
      })
    }

    return () => { cancelled = true }
  }, [initialSource, initialSourceId])

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    setSearching(true)
    const t = setTimeout(async () => {
      const r = await searchCustomersAction(searchQuery)
      setSearching(false)
      if (!r.error) setSearchResults(r.data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name, phone, email, or IMSI..."
            title="Search for a customer"
            className={inputCls}
          />
          {(searchQuery.trim() || searching) && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
              {searching && <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Searching…</div>}
              {!searching && searchResults && searchResults.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600">No matches.</div>
              )}
              {!searching && searchResults?.map((c) => (
                <button
                  key={c.id} type="button"
                  className="block w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => { setSearchQuery(''); setSearchResults(null); openCustomer(c.id) }}
                >
                  {c.name} — {c.phone}{c.email ? ` — ${c.email}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => setCallbackModal({ open: true, editing: null })} title="Schedule a callback" className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <Phone className="w-4 h-4" /> Callback
        </button>
        <button onClick={() => setFollowupModal({ open: true, editing: null, history: [] })} title="Add a follow-up" className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <FileText className="w-4 h-4" /> Follow-up
        </button>
        {!isBillingAgent && (
          <button onClick={() => setNewTicketOpen(true)} title="Create a new ticket in any queue" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New Ticket
          </button>
        )}
        {isBillingAgent && (
          <button onClick={() => setBillingTicketOpen(true)} title="Create a Billing follow-up ticket" className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Tickets
          </button>
        )}
      </div>

      <TicketListTable
        rows={rows} totalCount={totalCount} page={page} pageSize={pageSize}
        queue={queue} statusGroup={statusGroup} nativeStatus={nativeStatus}
        mine={mine} privileged={privileged} agentOptions={agentCandidates} assignedAgentId={assignedAgentId}
        updatedFrom={updatedFrom} updatedTo={updatedTo}
        hideQueueSelect={isBillingAgent}
      />

      {initialCustomerId && (
        <CustomerPanel
          customerId={initialCustomerId}
          onClose={() => clearParams(['customer'])}
          onOpenTicket={openTicketRecord}
        />
      )}

      {newTicketOpen && (
        <CreateTicketOrchestrator
          onClose={() => setNewTicketOpen(false)}
          customers={customers}
          agentCandidates={agentCandidates}
          userId={userId}
          canAssign={canAssign}
          onSaved={() => { setNewTicketOpen(false); router.refresh() }}
        />
      )}

      {billingTicketOpen && (
        <CreateTicketOrchestrator
          forceBillingQueue
          onClose={() => setBillingTicketOpen(false)}
          customers={customers}
          agentCandidates={agentCandidates}
          userId={userId}
          canAssign={canAssign}
          onSaved={() => { setBillingTicketOpen(false); router.refresh() }}
        />
      )}

      {supportTicketModal.open && (
        <SupportTicketModal
          open
          onClose={() => { setSupportTicketModal({ open: false, editing: null }); clearParams(['source', 'id']) }}
          editing={supportTicketModal.editing}
          customers={customers}
          agentCandidates={agentCandidates}
          userId={userId}
          canAssign={canAssign}
          onSaved={() => { setSupportTicketModal({ open: false, editing: null }); clearParams(['source', 'id']) }}
        />
      )}

      {billingStatusModal.open && billingStatusModal.ticket && (
        <BillingStatusModal
          open
          onClose={() => { setBillingStatusModal({ open: false, ticket: null }); clearParams(['source', 'id']) }}
          ticket={billingStatusModal.ticket}
          onSaved={() => { setBillingStatusModal({ open: false, ticket: null }); clearParams(['source', 'id']) }}
        />
      )}

      {t2TicketModal.open && t2TicketModal.data && (
        <T2TicketDetailModal
          open
          onClose={() => { setT2TicketModal({ open: false, data: null }); clearParams(['source', 'id']) }}
          data={t2TicketModal.data}
          userId={userId}
          onRefresh={() => {
            if (!initialSourceId) return
            getTicketModalDataAction(initialSourceId).then((res) => {
              if (res.data?.kind === 't2') setT2TicketModal({ open: true, data: res.data.data })
            })
          }}
        />
      )}

      {followupModal.open && (
        privileged ? (
          <AssignFollowupModal
            key={followupModal.editing?.id ?? 'add'}
            open
            onClose={() => { setFollowupModal({ open: false, editing: null, history: [] }); clearParams(['source', 'id']) }}
            editing={followupModal.editing}
            customers={customers}
            agentCandidates={agentCandidates}
            teamLeaderCandidates={teamLeaderCandidates}
            categories={categories}
            history={followupModal.history}
            userId={userId}
            onSaved={() => { setFollowupModal({ open: false, editing: null, history: [] }); clearParams(['source', 'id']); router.refresh() }}
          />
        ) : (
          <FollowupModal
            open
            onClose={() => { setFollowupModal({ open: false, editing: null, history: [] }); clearParams(['source', 'id']) }}
            customers={customers}
            categories={categories}
            queueOptions={followupQueueOptions}
            editing={followupModal.editing}
            onSaved={() => { setFollowupModal({ open: false, editing: null, history: [] }); clearParams(['source', 'id']) }}
          />
        )
      )}

      {callbackModal.open && (
        <CallbackModal
          open
          onClose={() => { setCallbackModal({ open: false, editing: null }); clearParams(['source', 'id']) }}
          customers={customers}
          userId={userId}
          isAdmin={isAdmin}
          agents={callbackAgents}
          queueOptions={followupQueueOptions}
          editing={callbackModal.editing}
          onSaved={() => { setCallbackModal({ open: false, editing: null }); clearParams(['source', 'id']) }}
        />
      )}
    </div>
  )
}
