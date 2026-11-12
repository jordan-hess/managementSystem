'use client'

import { useEffect, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { searchCustomersAction, type CustomerSearchResult } from '@/lib/customers/search'
import { createCustomerAction } from '@/lib/customers/actions'
import { sanitizePhoneInput } from '@/lib/customers/phone'
import { useFormErrors, type FieldErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'
import { getActiveAssistanceAction, claimActiveAssistanceAction } from '@/lib/activeAssistance/actions'
import { QUEUES } from '@/lib/t2/constants'
import { AnyQueue, SOCIAL_QUEUES } from '@/lib/queues/constants'
import CreateTicketModal from '@/components/t2/CreateTicketModal'
import BillingTicketModal from './BillingTicketModal'
import SupportTicketModal, { CHANNEL_CONFIG } from './SupportTicketModal'
import ActiveAssistanceBanner from '@/components/active-assistance/ActiveAssistanceBanner'
import DuplicateAssistanceModal from '@/components/active-assistance/DuplicateAssistanceModal'
import { ActiveAssistanceRecord, FollowupAssignee, SupportTicketChannel } from '@/types'

interface CustomerOption { id: string; name: string; phone: string }

type NewCustomerField = 'new_name' | 'new_phone' | 'new_email'
const NEW_CUSTOMER_FIELDS: readonly NewCustomerField[] = ['new_name', 'new_phone', 'new_email']

interface Props {
  onClose: () => void
  customers: CustomerOption[]
  agentCandidates: FollowupAssignee[]
  userId: string
  canAssign: boolean
  onSaved: () => void
  /** Skip the queue-picker step and go straight to the BILLING form once a customer is picked — for Billing-team entry points that only ever create BILLING tickets. */
  forceBillingQueue?: boolean
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

/**
 * "+ New Ticket" dispatcher: customer step -> queue step (9 options) ->
 * delegates to whichever existing form fits. Not a mega-form — a thin
 * router over already-validated, already-tested field logic in
 * CreateTicketModal (T2) and SupportTicketModal (Social).
 *
 * Follow-ups and callbacks aren't queue-scoped (no channel/queue column on
 * either table), so they're not part of this flow — they have their own
 * toolbar buttons on the Tickets page opening FollowupModal/CallbackModal
 * directly.
 */
export default function CreateTicketOrchestrator({ onClose, customers, agentCandidates, userId, canAssign, onSaved, forceBillingQueue }: Props) {
  const [step, setStep] = useState<'customer' | 'queue' | 'form'>('customer')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<NewCustomerField>(NEW_CUSTOMER_FIELDS)
  const [queue, setQueue] = useState<AnyQueue | ''>('')
  const [activeAssistance, setActiveAssistance] = useState<ActiveAssistanceRecord[]>([])
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults(null); return }
    setSearching(true)
    const t = setTimeout(async () => {
      const r = await searchCustomersAction(query)
      setSearching(false)
      if (!r.error) setResults(r.data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  async function pickCustomer(c: CustomerOption) {
    setSelectedCustomer(c)
    setQuery('')
    setResults(null)
    setActiveAssistance([])
    if (forceBillingQueue) {
      setQueue('BILLING')
      setStep('form')
    } else {
      setStep('queue')
    }
    // A brand-new customer (from "+ New customer" below) can't have active
    // tickets yet — this just resolves to an empty array for them, harmless.
    const result = await getActiveAssistanceAction(c.id)
    if (result.data) {
      setActiveAssistance(result.data)
      if (result.data.length > 0) setDuplicateModalOpen(true)
    }
  }

  async function handleTakeOwnership(record: ActiveAssistanceRecord) {
    const result = await claimActiveAssistanceAction(record.sourceType, record.sourceId)
    if (result.error) { alert(`Could not take ownership: ${result.error}`); return }
    setDuplicateModalOpen(false)
    onSaved()
  }

  async function handleAddCustomer() {
    clearAll()
    const missing: FieldErrors<NewCustomerField> = {}
    if (!newName.trim()) missing.new_name = 'Full name is required.'
    if (!newPhone.trim()) missing.new_phone = 'Phone number is required.'
    if (!newEmail.trim()) missing.new_email = 'Email is required.'
    if (Object.keys(missing).length > 0) { setFieldErrors(missing); return }
    setCreatingCustomer(true)
    const result = await createCustomerAction(newName.trim(), newPhone.trim(), newEmail.trim())
    setCreatingCustomer(false)
    if (result.error) { applyActionError(result, { name: 'new_name', phone: 'new_phone', email: 'new_email' }); return }
    pickCustomer({ id: result.data!.id, name: newName.trim(), phone: newPhone.trim() })
    setShowNewCustomer(false)
    setNewName('')
    setNewPhone('')
    setNewEmail('')
  }

  // Built up (rather than an early `return`) so DuplicateAssistanceModal
  // below stays mounted no matter which branch fires — including the
  // forceBillingQueue path, which jumps straight from 'customer' to the
  // BILLING form and never renders the step === 'queue' JSX that the other
  // queues rely on to keep that modal in the tree while their async
  // active-assistance precheck (kicked off in pickCustomer) resolves.
  let formContent: React.ReactNode = null
  if (step === 'form' && selectedCustomer && queue) {
    if (queue === 'BILLING') {
      formContent = <BillingTicketModal onClose={onClose} customerId={selectedCustomer.id} onSaved={onSaved} />
    } else if ((QUEUES as readonly string[]).includes(queue)) {
      formContent = <CreateTicketModal onClose={onClose} customers={customers} initialCustomer={selectedCustomer} initialQueue={queue} />
    } else {
      formContent = (
        <SupportTicketModal
          open
          onClose={onClose}
          editing={null}
          customers={customers}
          agentCandidates={agentCandidates}
          userId={userId}
          canAssign={canAssign}
          initialCustomerId={selectedCustomer.id}
          initialChannel={queue as SupportTicketChannel}
          onSaved={onSaved}
        />
      )
    }
  }

  return (
    <>
    {formContent ?? (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">New Ticket</h2>

        {step === 'customer' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelCls}>Customer *</label>
              <button type="button" className="text-xs text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setShowNewCustomer((v) => !v)}>
                {showNewCustomer ? 'Cancel' : '+ New customer'}
              </button>
            </div>
            {showNewCustomer ? (
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    id="orchestrator-new_name" className={fieldInputClass(inputCls, !!fieldErrors.new_name)} {...fieldA11y('orchestrator-new_name', fieldErrors.new_name)}
                    placeholder="Full name" value={newName} onChange={(e) => { setNewName(e.target.value); clearFieldError('new_name') }}
                  />
                  <FieldError id="orchestrator-new_name" message={fieldErrors.new_name} />
                </div>
                <div className="flex-1">
                  <input
                    id="orchestrator-new_phone" className={fieldInputClass(inputCls, !!fieldErrors.new_phone)} {...fieldA11y('orchestrator-new_phone', fieldErrors.new_phone)}
                    type="tel" inputMode="tel" placeholder="Phone" value={newPhone} onChange={(e) => { setNewPhone(sanitizePhoneInput(e.target.value)); clearFieldError('new_phone') }}
                  />
                  <FieldError id="orchestrator-new_phone" message={fieldErrors.new_phone} />
                </div>
                <div className="flex-1">
                  <input
                    id="orchestrator-new_email" type="email" className={fieldInputClass(inputCls, !!fieldErrors.new_email)} {...fieldA11y('orchestrator-new_email', fieldErrors.new_email)}
                    placeholder="Email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); clearFieldError('new_email') }}
                  />
                  <FieldError id="orchestrator-new_email" message={fieldErrors.new_email} />
                </div>
                <button
                  type="button"
                  className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg"
                  disabled={creatingCustomer}
                  onClick={handleAddCustomer}
                >
                  {creatingCustomer ? 'Adding…' : 'Add'}
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className={`${inputCls} pl-9`} placeholder="Search by name, phone, email, or IMSI…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                {(query.trim() || searching) && (
                  <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                    {searching && <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Searching…</div>}
                    {!searching && results && results.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600">No matches — try &quot;+ New customer&quot; above.</div>
                    )}
                    {!searching && results?.map((c) => (
                      <button key={c.id} type="button" className="block w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => pickCustomer(c)}>
                        {c.name} — {c.phone}{c.email ? ` — ${c.email}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <FormErrorBanner message={formError} />
          </div>
        )}

        {step === 'queue' && selectedCustomer && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800">
              <span className="text-gray-900 dark:text-white">{selectedCustomer.name} — {selectedCustomer.phone}</span>
              <button type="button" className="text-xs text-blue-600 dark:text-blue-400 hover:underline" onClick={() => { setSelectedCustomer(null); setStep('customer') }}>
                Change
              </button>
            </div>
            <ActiveAssistanceBanner records={activeAssistance} variant="banner" />
            <div>
              <label className={labelCls}>Queue *</label>
              <select required className={inputCls} value={queue} onChange={(e) => setQueue(e.target.value as AnyQueue)}>
                <option value="">Select…</option>
                <optgroup label="Social">
                  {SOCIAL_QUEUES.map((q) => <option key={q} value={q}>{CHANNEL_CONFIG[q].label}</option>)}
                </optgroup>
                <optgroup label="T2">
                  {QUEUES.map((q) => <option key={q} value={q}>{q}</option>)}
                </optgroup>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button type="button" disabled={!queue} onClick={() => setStep('form')} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium">
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    )}

    <DuplicateAssistanceModal
      open={duplicateModalOpen}
      onClose={() => setDuplicateModalOpen(false)}
      records={activeAssistance}
      canTakeOwnership
      onTakeOwnership={handleTakeOwnership}
      onContinueAnyway={() => setDuplicateModalOpen(false)}
    />
    </>
  )
}
