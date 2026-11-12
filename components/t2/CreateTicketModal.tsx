'use client'

// T2 Queue Hub merge, Phase 2 — ported from
// t2-queue-hub/frontend/src/components/CreateTicketModal.jsx. Calls
// createTicketAction (Server Action) instead of POST /api/tickets.
//
// The form is queue-specific: Advanced shows issue-type/root-cause/outcome
// plus the generic network-diagnostics fields; SIM SWAP and MNP (queue
// value 'PORTING') each show their own distinct field set instead — see
// createTicketAction's isSimSwap/isMnp branches for how these map onto
// tickets' columns. VOICE falls back to the generic Advanced-style fields
// until its own spec lands.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createTicketAction,
  type CreateTicketInput,
} from '@/app/(app)/t2/actions'
import { searchCustomersAction, type CustomerSearchResult } from '@/lib/customers/search'
import { createCustomerAction } from '@/lib/customers/actions'
import { sanitizePhoneInput } from '@/lib/customers/phone'
import { getActiveAssistanceAction, claimActiveAssistanceAction } from '@/lib/activeAssistance/actions'
import ActiveAssistanceBanner from '@/components/active-assistance/ActiveAssistanceBanner'
import DuplicateAssistanceModal from '@/components/active-assistance/DuplicateAssistanceModal'
import { ActiveAssistanceRecord } from '@/types'
import { useFormErrors, type FieldErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'
import { validateCreateTicket, CREATE_TICKET_FIELDS, type CreateTicketField } from './CreateTicketModal.validation'
import { QUEUES, ROOT_CAUSES, ADVANCED_OUTCOMES, ADVANCED_ESCALATE_TEAMS, DEVICES, ESCALATION_PATHS } from '@/lib/t2/constants'

const ADVANCED_ISSUE_TYPES = [
  'Slow speeds',
  'Intermittent connectivity',
  'No throughput',
  'No connection',
  'WiFi issues',
  'Faulty router/SIM',
  'No active service/profile',
  '101 scan for support display',
  'Not specified / failed contact',
]

const SIM_TYPES = ['4G Mobile sim swap', '4G Data Only sim swap']
const SWAP_REASONS = ['Lost/Stolen', 'Damaged']

const PORT_ISSUE_TYPES = ['Port not captured', 'Port rejected', 'Port delayed']
const PORT_INQUIRY_TYPES = ['Port reversal', 'Port Out']
const PORT_REVERSAL_REASONS = ['No coverage', 'Voice app', 'Device compatibility', 'Incorrect number ported', 'USSD']
const DONOR_ISPS = ['Cell C', 'Telkom', 'MTN', 'Capitec', 'FNB']
const OTHER = 'Other'

const EMPTY: CreateTicketInput = {
  customer_id: '', queue: '', issue_type: null, description: null, address: null, plus_code: null, imsi: null, msisdn: null,
  customer_email: null, regular_site: null, provisioning_status: null, project: null, root_cause: null,
  rsrp: null, rsrq: null, sinr: null, serving_site: null, connected_site: null, band: null,
  network_technology: null, download_speed: null, upload_speed: null, latency: null, device: null,
  escalation_path: null,
  outcome: null,
  sim_type: null, swap_reason: null, swap_requested_date: null, swap_processed: null, station_ticket_number: null,
  port_in: null, port_customer_experiencing_issues: null, port_issue_type: null, port_inquiry_type: null,
  port_reversal_reason: null, donor_isp: null,
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'

/** A <select> with a fixed option list plus "Other" revealing a free-text box — the
 *  value ultimately stored is either the picked option, or the free text typed for Other. */
function SelectWithOther({
  label, options, value, onChange, required = false, id, error,
}: {
  label: string
  options: string[]
  value: string | null
  onChange: (v: string | null) => void
  required?: boolean
  id?: string
  error?: string
}) {
  const isOther = !!value && !options.includes(value)
  const [choice, setChoice] = useState(isOther ? OTHER : value ?? '')
  const [otherText, setOtherText] = useState(isOther ? value! : '')

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select
        id={id}
        required={required}
        className={fieldInputClass(inputCls, !!error)}
        {...(id ? fieldA11y(id, error) : {})}
        value={choice}
        onChange={(e) => {
          const v = e.target.value
          setChoice(v)
          onChange(v === OTHER ? otherText : v || null)
        }}
      >
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={OTHER}>{OTHER}</option>
      </select>
      {id && <FieldError id={id} message={error} />}
      {choice === OTHER && (
        <input
          className={`${inputCls} mt-2`}
          placeholder="Specify"
          value={otherText}
          onChange={(e) => { setOtherText(e.target.value); onChange(e.target.value) }}
        />
      )}
    </div>
  )
}

interface CustomerOption { id: string; name: string; phone: string }

export default function CreateTicketModal({
  onClose, initialCustomer, initialQueue,
}: {
  onClose: () => void
  /** No longer read here (customers are chosen by search); kept so existing callers still type-check. */
  customers?: CustomerOption[]
  /** Phase 2's CreateTicketOrchestrator already resolved a customer — skip this modal's own search step. */
  initialCustomer?: CustomerOption
  /** The orchestrator's queue step already picked a queue — preselect it and skip this modal's own queue dropdown. */
  initialQueue?: string
}) {
  const router = useRouter()
  const [form, setForm] = useState<CreateTicketInput>({ ...EMPTY, customer_id: initialCustomer?.id ?? '', queue: initialQueue ?? '' })
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<CreateTicketField>(CREATE_TICKET_FIELDS)

  // ── customer search (name, email, or a past ticket's IMSI) ──
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(initialCustomer ?? null)
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [activeAssistance, setActiveAssistance] = useState<ActiveAssistanceRecord[]>([])
  const [duplicateRecords, setDuplicateRecords] = useState<ActiveAssistanceRecord[]>([])
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [duplicateMode, setDuplicateMode] = useState<'precheck' | 'submit'>('precheck')

  useEffect(() => {
    if (!query.trim()) { setResults(null); return }
    setSearching(true)
    const t = setTimeout(async () => {
      const r = await searchCustomersAction(query)
      setSearching(false)
      if (!r.error) setResults(r.data!)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  // initialCustomer skips the search step, but the duplicate-check that
  // pickCustomer would normally run must still fire — this is the same
  // customer-selection moment, just resolved by the orchestrator instead of
  // this modal's own search box.
  useEffect(() => {
    if (!initialCustomer) return
    getActiveAssistanceAction(initialCustomer.id).then((result) => {
      if ('error' in result) return
      setActiveAssistance(result.data)
      if (result.data.length > 0) {
        setDuplicateRecords(result.data)
        setDuplicateMode('precheck')
        setDuplicateModalOpen(true)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pickCustomer(c: CustomerOption) {
    setSelectedCustomer(c)
    set('customer_id', c.id)
    clearFieldError('customer')
    setQuery('')
    setResults(null)
    setActiveAssistance([])
    // A brand-new customer (from "+ New customer" below) can't have active
    // tickets yet — this just resolves to an empty array for them, harmless.
    const result = await getActiveAssistanceAction(c.id)
    if (!('error' in result)) {
      setActiveAssistance(result.data)
      if (result.data.length > 0) {
        setDuplicateRecords(result.data)
        setDuplicateMode('precheck')
        setDuplicateModalOpen(true)
      }
    }
  }

  async function handleAddCustomer() {
    clearAll()
    const missing: FieldErrors<CreateTicketField> = {}
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

  function set<K extends keyof CreateTicketInput>(key: K, value: CreateTicketInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    // Editing a field clears that field's error; form keys that are not error
    // fields (and 'customer_id', cleared in pickCustomer) are harmless no-ops.
    clearFieldError(key as CreateTicketField)
  }

  function changeQueue(queue: string) {
    clearAll()
    setForm((f) => ({ ...EMPTY, customer_id: f.customer_id, queue }))
  }

  // Outcome: fixed dropdown for Advanced; "Escalated" reveals a team
  // sub-select, and the combined value ("Escalated - NPO") is what's stored
  // — informational only, see actions.ts's header comment.
  const [outcomeChoice, setOutcomeChoice] = useState('')
  const [escalateTeam, setEscalateTeam] = useState('')
  function changeOutcome(value: string) {
    setOutcomeChoice(value)
    if (value === 'Escalated') set('outcome', escalateTeam ? `Escalated - ${escalateTeam}` : 'Escalated')
    else set('outcome', value || null)
  }
  function changeEscalateTeam(team: string) {
    setEscalateTeam(team)
    set('outcome', team ? `Escalated - ${team}` : 'Escalated')
  }

  const isSimSwap = form.queue === 'SIM SWAP'
  const isMnp = form.queue === 'PORTING'
  const isGeneric = !isSimSwap && !isMnp

  async function handleSave(e?: React.FormEvent, override = false) {
    e?.preventDefault()
    clearAll()
    const errs = validateCreateTicket(form, { isSimSwap, isMnp, isGeneric })
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    setSaving(true)
    const result = await createTicketAction(form, override)
    setSaving(false)
    if ('duplicates' in result && result.duplicates) {
      setDuplicateRecords(result.duplicates)
      setDuplicateMode('submit')
      setDuplicateModalOpen(true)
      return
    }
    if (result.error) applyActionError(result)
    else { onClose(); router.push(`/tickets/t2/${result.data!.id}`); router.refresh() }
  }

  function handleContinueAnyway() {
    setDuplicateModalOpen(false)
    if (duplicateMode === 'submit') handleSave(undefined, true)
    // 'precheck' just dismisses — the agent keeps filling in the form; the
    // real, race-safe check happens server-side on actual submit.
  }

  function handleViewExisting(record: ActiveAssistanceRecord) {
    if (record.sourceType === 't2_ticket') {
      onClose()
      router.push(`/tickets/t2/${record.sourceId}`)
    }
    // Social-side records (support_ticket/followup/callback) have no
    // dedicated detail route — see the CreateTicketOrchestrator/TicketListTable
    // deep-link convention (?source=&id=) for those instead.
  }

  async function handleTakeOwnership(record: ActiveAssistanceRecord) {
    const result = await claimActiveAssistanceAction(record.sourceType, record.sourceId)
    if ('error' in result) { alert(`Could not take ownership: ${result.error}`); return }
    setDuplicateModalOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">New Ticket{initialQueue ? ` — ${initialQueue}` : ''}</h2>
        <FormErrorBanner message={formError} />
        <form onSubmit={handleSave} noValidate className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls}>Customer *</label>
              <button
                type="button"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                onClick={() => setShowNewCustomer((v) => !v)}
              >
                {showNewCustomer ? 'Cancel' : '+ New customer'}
              </button>
            </div>
            {showNewCustomer ? (
              <>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    id="create-ticket-new_name" className={fieldInputClass(inputCls, !!fieldErrors.new_name)} {...fieldA11y('create-ticket-new_name', fieldErrors.new_name)}
                    placeholder="Full name" value={newName} onChange={(e) => { setNewName(e.target.value); clearFieldError('new_name') }}
                  />
                  <FieldError id="create-ticket-new_name" message={fieldErrors.new_name} />
                </div>
                <div className="flex-1">
                  <input
                    id="create-ticket-new_phone" className={fieldInputClass(inputCls, !!fieldErrors.new_phone)} {...fieldA11y('create-ticket-new_phone', fieldErrors.new_phone)}
                    type="tel" inputMode="tel" placeholder="Phone" value={newPhone} onChange={(e) => { setNewPhone(sanitizePhoneInput(e.target.value)); clearFieldError('new_phone') }}
                  />
                  <FieldError id="create-ticket-new_phone" message={fieldErrors.new_phone} />
                </div>
                <div className="flex-1">
                  <input
                    id="create-ticket-new_email" type="email" className={fieldInputClass(inputCls, !!fieldErrors.new_email)} {...fieldA11y('create-ticket-new_email', fieldErrors.new_email)}
                    placeholder="Email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); clearFieldError('new_email') }}
                  />
                  <FieldError id="create-ticket-new_email" message={fieldErrors.new_email} />
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
              {/* The ticket's own "customer required" error must stay visible while the new-customer form is open. */}
              <FieldError id="create-ticket-customer" message={fieldErrors.customer} />
              </>
            ) : selectedCustomer ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800">
                  <span className="text-gray-900 dark:text-white">{selectedCustomer.name} — {selectedCustomer.phone}</span>
                  <button type="button" className="text-xs text-blue-600 dark:text-blue-400 hover:underline" onClick={() => { setSelectedCustomer(null); set('customer_id', ''); setActiveAssistance([]) }}>
                    Change
                  </button>
                </div>
                <ActiveAssistanceBanner records={activeAssistance} variant="banner" />
              </div>
            ) : (
              <div className="relative">
                <input
                  id="create-ticket-customer"
                  className={fieldInputClass(inputCls, !!fieldErrors.customer)}
                  {...fieldA11y('create-ticket-customer', fieldErrors.customer)}
                  placeholder="Search by name, email, or IMSI…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {(query.trim() || searching) && (
                  <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                    {searching && <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600">Searching…</div>}
                    {!searching && results && results.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600">No matches — try &quot;+ New customer&quot; above.</div>
                    )}
                    {!searching && results?.map((c) => (
                      <button
                        key={c.id} type="button"
                        className="block w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => pickCustomer(c)}
                      >
                        {c.name} — {c.phone}{c.email ? ` — ${c.email}` : ''}
                      </button>
                    ))}
                  </div>
                )}
                <FieldError id="create-ticket-customer" message={fieldErrors.customer} />
              </div>
            )}
          </div>

          {!initialQueue && (
            <div className="col-span-2">
              <label className={labelCls}>Queue</label>
              <select
                id="create-ticket-queue" required className={fieldInputClass(inputCls, !!fieldErrors.queue)} {...fieldA11y('create-ticket-queue', fieldErrors.queue)}
                value={form.queue} onChange={(e) => changeQueue(e.target.value)}
              >
                <option value="">Select…</option>
                {QUEUES.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
              <FieldError id="create-ticket-queue" message={fieldErrors.queue} />
            </div>
          )}

          {form.queue === 'ADVANCED' && (
            <div className="col-span-2">
              <SelectWithOther
                label="Escalation Path"
                options={ESCALATION_PATHS}
                value={form.escalation_path}
                onChange={(v) => set('escalation_path', v)}
              />
            </div>
          )}

          {isSimSwap && (
            <SimSwapFields form={form} set={set} errors={fieldErrors} />
          )}

          {isMnp && (
            <MnpFields form={form} set={set} errors={fieldErrors} />
          )}

          {isGeneric && (
            <>
              <div>
                <label className={labelCls}>Issue type</label>
                <select
                  id="create-ticket-issue_type" required className={fieldInputClass(inputCls, !!fieldErrors.issue_type)} {...fieldA11y('create-ticket-issue_type', fieldErrors.issue_type)}
                  value={form.issue_type ?? ''} onChange={(e) => set('issue_type', e.target.value || null)}
                >
                  <option value="">Select…</option>
                  {ADVANCED_ISSUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <FieldError id="create-ticket-issue_type" message={fieldErrors.issue_type} />
              </div>
              <div>
                <label className={labelCls}>Root cause</label>
                <select className={inputCls} value={form.root_cause ?? ''} onChange={(e) => set('root_cause', e.target.value || null)}>
                  <option value="">Select…</option>
                  {ROOT_CAUSES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Device</label>
                <select className={inputCls} value={form.device ?? ''} onChange={(e) => set('device', e.target.value || null)}>
                  <option value="">Select…</option>
                  {DEVICES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Description (notes)</label>
                <textarea className={inputCls} value={form.description ?? ''} onChange={(e) => set('description', e.target.value || null)} />
              </div>
              <div>
                <label className={labelCls}>Customer location (full address, incl. suburb)</label>
                <input className={inputCls} value={form.address ?? ''} onChange={(e) => set('address', e.target.value || null)} />
              </div>
              <div>
                <label className={labelCls}>Regular site</label>
                <input className={inputCls} value={form.regular_site ?? ''} onChange={(e) => set('regular_site', e.target.value || null)} />
              </div>
              <div>
                <label className={labelCls}>IMSI</label>
                <input className={inputCls} value={form.imsi ?? ''} onChange={(e) => set('imsi', e.target.value || null)} />
              </div>
              <div>
                <label className={labelCls}>MSISDN</label>
                <input className={inputCls} value={form.msisdn ?? ''} onChange={(e) => set('msisdn', e.target.value || null)} />
              </div>
              <div>
                <label className={labelCls}>Provisioning status</label>
                <select className={inputCls} value={form.provisioning_status ?? ''} onChange={(e) => set('provisioning_status', e.target.value || null)}>
                  <option value="">Select…</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="N/A">N/A</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>RSRP</label>
                <input className={inputCls} value={form.rsrp ?? ''} onChange={(e) => set('rsrp', e.target.value || null)} />
              </div>
              <div>
                <label className={labelCls}>SINR</label>
                <input className={inputCls} value={form.sinr ?? ''} onChange={(e) => set('sinr', e.target.value || null)} />
              </div>
              <div>
                <label className={labelCls}>Outcome</label>
                <select className={inputCls} value={outcomeChoice} onChange={(e) => changeOutcome(e.target.value)}>
                  <option value="">Select…</option>
                  {ADVANCED_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              {outcomeChoice === 'Escalated' && (
                <div>
                  <label className={labelCls}>Escalated to</label>
                  <select className={inputCls} value={escalateTeam} onChange={(e) => changeEscalateTeam(e.target.value)}>
                    <option value="">Select…</option>
                    {ADVANCED_ESCALATE_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="col-span-2 flex gap-2 justify-end mt-2">
            <button type="button" className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg" disabled={saving}>
              {saving ? 'Creating…' : 'Create ticket'}
            </button>
          </div>
        </form>
      </div>

      <DuplicateAssistanceModal
        open={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        records={duplicateRecords}
        canTakeOwnership
        onViewExisting={handleViewExisting}
        isViewable={r => r.sourceType === 't2_ticket'}
        onTakeOwnership={handleTakeOwnership}
        onContinueAnyway={handleContinueAnyway}
      />
    </div>
  )
}

function SimSwapFields({ form, set, errors }: { form: CreateTicketInput; set: <K extends keyof CreateTicketInput>(k: K, v: CreateTicketInput[K]) => void; errors: FieldErrors<CreateTicketField> }) {
  const [reasonChoice, setReasonChoice] = useState<'' | 'Lost/Stolen' | 'Damaged' | 'Other'>('')
  const [reasonOtherText, setReasonOtherText] = useState('')

  function changeReasonChoice(value: typeof reasonChoice) {
    setReasonChoice(value)
    if (value === 'Other') set('swap_reason', reasonOtherText)
    else set('swap_reason', value || null)
  }

  return (
    <>
      <div>
        <label className={labelCls}>Sim type</label>
        <select
          id="create-ticket-sim_type" required className={fieldInputClass(inputCls, !!errors.sim_type)} {...fieldA11y('create-ticket-sim_type', errors.sim_type)}
          value={form.sim_type ?? ''} onChange={(e) => set('sim_type', e.target.value || null)}
        >
          <option value="">Select…</option>
          {SIM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <FieldError id="create-ticket-sim_type" message={errors.sim_type} />
      </div>
      <div>
        <label className={labelCls}>Reason for the SIM Swap request</label>
        <select
          id="create-ticket-swap_reason" required className={fieldInputClass(inputCls, !!errors.swap_reason)} {...fieldA11y('create-ticket-swap_reason', errors.swap_reason)}
          value={reasonChoice} onChange={(e) => changeReasonChoice(e.target.value as typeof reasonChoice)}
        >
          <option value="">Select…</option>
          {SWAP_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          <option value={OTHER}>{OTHER}</option>
        </select>
        <FieldError id="create-ticket-swap_reason" message={errors.swap_reason} />
      </div>
      {reasonChoice === 'Other' && (
        <div className="col-span-2">
          <label className={labelCls}>Other reason</label>
          <input
            className={inputCls}
            value={reasonOtherText}
            onChange={(e) => { setReasonOtherText(e.target.value); set('swap_reason', e.target.value) }}
          />
        </div>
      )}
      <div>
        <label className={labelCls}>When was the SIM Swap requested</label>
        <input
          id="create-ticket-swap_requested_date" type="date" required className={fieldInputClass(inputCls, !!errors.swap_requested_date)} {...fieldA11y('create-ticket-swap_requested_date', errors.swap_requested_date)}
          value={form.swap_requested_date ?? ''} onChange={(e) => set('swap_requested_date', e.target.value || null)}
        />
        <FieldError id="create-ticket-swap_requested_date" message={errors.swap_requested_date} />
      </div>
      <div>
        <label className={labelCls}>SIM Swap processed</label>
        <select className={inputCls} value={form.swap_processed ?? ''} onChange={(e) => set('swap_processed', e.target.value || null)}>
          <option value="">Select…</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>MSISDN</label>
        <input className={inputCls} value={form.msisdn ?? ''} onChange={(e) => set('msisdn', e.target.value || null)} />
      </div>
      <div>
        <label className={labelCls}>Station ticket number</label>
        <input className={inputCls} value={form.station_ticket_number ?? ''} onChange={(e) => set('station_ticket_number', e.target.value || null)} />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>Outcome</label>
        <textarea className={inputCls} value={form.outcome ?? ''} onChange={(e) => set('outcome', e.target.value || null)} />
      </div>
    </>
  )
}

function MnpFields({ form, set, errors }: { form: CreateTicketInput; set: <K extends keyof CreateTicketInput>(k: K, v: CreateTicketInput[K]) => void; errors: FieldErrors<CreateTicketField> }) {
  return (
    <>
      <div>
        <label className={labelCls}>Is this a port in request?</label>
        <select
          id="create-ticket-port_in" required className={fieldInputClass(inputCls, !!errors.port_in)} {...fieldA11y('create-ticket-port_in', errors.port_in)}
          value={form.port_in ?? ''}
          onChange={(e) => set('port_in', e.target.value || null)}
        >
          <option value="">Select…</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
        <FieldError id="create-ticket-port_in" message={errors.port_in} />
      </div>
      <div />

      {form.port_in === 'Yes' && (
        <div>
          <label className={labelCls}>Is the customer experiencing issues?</label>
          <select
            id="create-ticket-port_customer_experiencing_issues" required className={fieldInputClass(inputCls, !!errors.port_customer_experiencing_issues)} {...fieldA11y('create-ticket-port_customer_experiencing_issues', errors.port_customer_experiencing_issues)}
            value={form.port_customer_experiencing_issues ?? ''}
            onChange={(e) => set('port_customer_experiencing_issues', e.target.value || null)}
          >
            <option value="">Select…</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
          <FieldError id="create-ticket-port_customer_experiencing_issues" message={errors.port_customer_experiencing_issues} />
        </div>
      )}
      {form.port_in === 'Yes' && form.port_customer_experiencing_issues === 'Yes' && (
        <SelectWithOther
          label="What's the issue?"
          options={PORT_ISSUE_TYPES}
          value={form.port_issue_type}
          onChange={(v) => set('port_issue_type', v)}
          required
          id="create-ticket-port_issue_type"
          error={errors.port_issue_type}
        />
      )}

      {form.port_in === 'No' && (
        <SelectWithOther
          label="What is the inquiry related to?"
          options={PORT_INQUIRY_TYPES}
          value={form.port_inquiry_type}
          onChange={(v) => set('port_inquiry_type', v)}
          required
          id="create-ticket-port_inquiry_type"
          error={errors.port_inquiry_type}
        />
      )}
      {form.port_in === 'No' && form.port_inquiry_type === 'Port reversal' && (
        <SelectWithOther
          label="Reason for reversal"
          options={PORT_REVERSAL_REASONS}
          value={form.port_reversal_reason}
          onChange={(v) => set('port_reversal_reason', v)}
          required
          id="create-ticket-port_reversal_reason"
          error={errors.port_reversal_reason}
        />
      )}

      {form.port_in && (
        <>
          <div className="col-span-2">
            <label className={labelCls}>Outcome</label>
            <textarea className={inputCls} value={form.outcome ?? ''} onChange={(e) => set('outcome', e.target.value || null)} />
          </div>
          <SelectWithOther
            label="Donor ISP (optional)"
            options={DONOR_ISPS}
            value={form.donor_isp}
            onChange={(v) => set('donor_isp', v)}
          />
          <div>
            <label className={labelCls}>Station ticket</label>
            <input className={inputCls} value={form.station_ticket_number ?? ''} onChange={(e) => set('station_ticket_number', e.target.value || null)} />
          </div>
          <div>
            <label className={labelCls}>MSISDN</label>
            <input className={inputCls} value={form.msisdn ?? ''} onChange={(e) => set('msisdn', e.target.value || null)} />
          </div>
        </>
      )}
    </>
  )
}
