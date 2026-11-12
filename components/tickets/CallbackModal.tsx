'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import DuplicateAssistanceModal from '@/components/active-assistance/DuplicateAssistanceModal'
import CustomerSearchField from './CustomerSearchField'
import { createCallback, updateCallback } from '@/app/(app)/support-tickets/actions'
import { getActiveAssistanceAction, claimActiveAssistanceAction } from '@/lib/activeAssistance/actions'
import { queueOptionLabel } from '@/lib/queues/constants'
import { ActiveAssistanceRecord, Callback, CallbackStatus } from '@/types'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'
import { validateCallback, CALLBACK_FIELDS, type CallbackField, type CallbackMode } from './CallbackModal.validation'

interface Props {
  open: boolean
  onClose: () => void
  customers: { id: string; name: string; phone: string }[]
  userId: string
  isAdmin?: boolean
  agents?: { id: string; full_name: string }[]
  // Department-scoped queue/channel options — see lib/queues/followupQueueOptions.ts.
  queueOptions: string[]
  editing?: Callback | null
  initialCustomerId?: string
  onSaved: () => void
}

const empty = {
  customer_id: '', scheduled_at: '', query_description: '',
  possible_solution: '', notes: '', status: 'pending' as CallbackStatus, agent_id: '', queue: '',
  mode: 'existing' as CallbackMode, contact_name: '', contact_email: '', contact_phone: '',
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

/** Schedule-callback modal — mechanically extracted from CallbackManager.tsx (Phase 2), same form/duplicate-check logic, minus the list it used to own. */
export default function CallbackModal({ open, onClose, customers, userId, isAdmin, agents = [], queueOptions, editing, initialCustomerId, onSaved }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(editing ? {
    customer_id: editing.customer_id ?? '',
    scheduled_at: editing.scheduled_at.slice(0, 16),
    query_description: editing.query_description,
    possible_solution: editing.possible_solution || '',
    notes: editing.notes || '',
    status: editing.status,
    agent_id: editing.agent_id ?? '',
    queue: editing.queue ?? '',
    mode: (editing.customer_id ? 'existing' : 'details') as CallbackMode,
    contact_name: editing.contact_name ?? '',
    contact_email: editing.contact_email ?? '',
    contact_phone: editing.contact_phone ?? '',
  } : { ...empty, customer_id: initialCustomerId ?? '' })
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<CallbackField>(CALLBACK_FIELDS)
  const [duplicateRecords, setDuplicateRecords] = useState<ActiveAssistanceRecord[]>([])
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [duplicateMode, setDuplicateMode] = useState<'precheck' | 'submit'>('precheck')
  const [dismissedForCustomer, setDismissedForCustomer] = useState<string | null>(null)

  const modeLocked = !!editing || !!initialCustomerId

  function switchMode(mode: CallbackMode) {
    if (mode === form.mode) return
    setForm(f => ({ ...f, mode, customer_id: '', contact_name: '', contact_email: '', contact_phone: '' }))
    setDismissedForCustomer(null)
    setDuplicateRecords([])
    setDuplicateModalOpen(false)
    clearAll()
  }

  async function handleCustomerChange(customerId: string) {
    setForm(f => ({ ...f, customer_id: customerId }))
    clearFieldError('customer')
    if (!customerId || customerId === dismissedForCustomer) return
    const result = await getActiveAssistanceAction(customerId)
    if (!('error' in result) && result.data.length > 0) {
      setDuplicateRecords(result.data)
      setDuplicateMode('precheck')
      setDuplicateModalOpen(true)
    }
  }

  async function handleSave(e?: React.FormEvent, override = false) {
    e?.preventDefault()
    clearAll()
    const errs = validateCallback(form)
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    setSaving(true)

    const targetAgentId = (isAdmin && form.agent_id) ? form.agent_id : userId
    const fields = {
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      query_description: form.query_description,
      possible_solution: form.possible_solution || null,
      notes: form.notes || null,
      status: form.status,
      completed_at: form.status === 'completed' ? new Date().toISOString() : null,
      queue: form.queue || null,
    }
    const payload = form.mode === 'details'
      ? { ...fields, customer_id: null, contact: { name: form.contact_name, email: form.contact_email, phone: form.contact_phone } }
      : { ...fields, customer_id: form.customer_id }

    const result = editing
      ? await updateCallback(editing.id, payload)
      : await createCallback(payload, targetAgentId, override)

    setSaving(false)
    if ('duplicates' in result && result.duplicates) {
      setDuplicateRecords(result.duplicates)
      setDuplicateMode('submit')
      setDuplicateModalOpen(true)
      return
    }
    if ('error' in result) { applyActionError({ error: result.error ?? 'Something went wrong.' }); return }
    router.refresh()
    onSaved()
  }

  function handleContinueAnyway() {
    setDuplicateModalOpen(false)
    if (duplicateMode === 'precheck') setDismissedForCustomer(form.customer_id)
    else handleSave(undefined, true)
  }

  async function handleTakeOwnership(record: ActiveAssistanceRecord) {
    const result = await claimActiveAssistanceAction(record.sourceType, record.sourceId)
    if ('error' in result) { alert(`Could not take ownership: ${result.error}`); return }
    setDuplicateModalOpen(false)
    router.refresh()
    onSaved()
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={editing ? 'Edit Callback' : 'Schedule Callback'}>
        <form onSubmit={handleSave} noValidate className="space-y-4">
          {isAdmin && !editing && (
            <div>
              <label className={labelCls}>Assign to Agent</label>
              <select
                id="callback-agent" value={form.agent_id} onChange={e => { setForm({ ...form, agent_id: e.target.value }); clearFieldError('agent') }}
                className={fieldInputClass(inputCls, !!fieldErrors.agent)} {...fieldA11y('callback-agent', fieldErrors.agent)}
              >
                <option value="">Myself</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
              <FieldError id="callback-agent" message={fieldErrors.agent} />
            </div>
          )}
          {!modeLocked && (
            <div>
              <span className={labelCls} id="callback-mode-label">Customer *</span>
              <div role="radiogroup" aria-labelledby="callback-mode-label" className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                {([['existing', 'Existing customer'], ['details', 'Callback details only']] as const).map(([value, label]) => (
                  <button
                    key={value} type="button" role="radio" aria-checked={form.mode === value}
                    onClick={() => switchMode(value)}
                    className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      form.mode === value
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {form.mode === 'existing' ? (
            <CustomerSearchField
              customers={customers}
              value={form.customer_id}
              onChange={handleCustomerChange}
              label={modeLocked ? 'Customer' : ''}
              required
              id="callback-customer"
              error={fieldErrors.customer}
              disabled={!!initialCustomerId}
            />
          ) : (
            <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Saved on this callback only. It is not added to the customer database.
              </p>
              <div>
                <label className={labelCls} htmlFor="callback-contact_name">Name</label>
                <input
                  id="callback-contact_name" value={form.contact_name} maxLength={120}
                  onChange={e => { setForm({ ...form, contact_name: e.target.value }); clearFieldError('contact_name') }}
                  className={fieldInputClass(inputCls, !!fieldErrors.contact_name)} {...fieldA11y('callback-contact_name', fieldErrors.contact_name)}
                  placeholder="Optional"
                />
                <FieldError id="callback-contact_name" message={fieldErrors.contact_name} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="callback-contact_phone">Contact number</label>
                  <input
                    id="callback-contact_phone" type="tel" value={form.contact_phone} maxLength={40}
                    onChange={e => { setForm({ ...form, contact_phone: e.target.value }); clearFieldError('contact_phone'); clearFieldError('contact') }}
                    className={fieldInputClass(inputCls, !!fieldErrors.contact_phone || !!fieldErrors.contact)} {...fieldA11y('callback-contact_phone', fieldErrors.contact_phone)}
                  />
                  <FieldError id="callback-contact_phone" message={fieldErrors.contact_phone} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="callback-contact_email">Email</label>
                  <input
                    id="callback-contact_email" type="email" value={form.contact_email} maxLength={254}
                    onChange={e => { setForm({ ...form, contact_email: e.target.value }); clearFieldError('contact_email'); clearFieldError('contact') }}
                    className={fieldInputClass(inputCls, !!fieldErrors.contact_email || !!fieldErrors.contact)} {...fieldA11y('callback-contact_email', fieldErrors.contact_email)}
                  />
                  <FieldError id="callback-contact_email" message={fieldErrors.contact_email} />
                </div>
              </div>
              <FieldError id="callback-contact" message={fieldErrors.contact} />
            </div>
          )}
          <div>
            <label className={labelCls}>Queue / Channel *</label>
            <select
              id="callback-queue" required value={form.queue} onChange={e => { setForm({ ...form, queue: e.target.value }); clearFieldError('queue') }}
              className={fieldInputClass(inputCls, !!fieldErrors.queue)} {...fieldA11y('callback-queue', fieldErrors.queue)}
            >
              <option value="">Select queue/channel...</option>
              {queueOptions.map(q => <option key={q} value={q}>{queueOptionLabel(q)}</option>)}
            </select>
            <FieldError id="callback-queue" message={fieldErrors.queue} />
          </div>
          <div>
            <label className={labelCls}>Scheduled Date &amp; Time *</label>
            <input
              id="callback-scheduled_at" type="datetime-local" required value={form.scheduled_at} onChange={e => { setForm({ ...form, scheduled_at: e.target.value }); clearFieldError('scheduled_at') }}
              className={fieldInputClass(inputCls, !!fieldErrors.scheduled_at)} {...fieldA11y('callback-scheduled_at', fieldErrors.scheduled_at)}
            />
            <FieldError id="callback-scheduled_at" message={fieldErrors.scheduled_at} />
          </div>
          <div>
            <label className={labelCls}>Query Description *</label>
            <textarea
              id="callback-query_description" required rows={3} value={form.query_description} onChange={e => { setForm({ ...form, query_description: e.target.value }); clearFieldError('query_description') }}
              className={`${fieldInputClass(inputCls, !!fieldErrors.query_description)} resize-none`} {...fieldA11y('callback-query_description', fieldErrors.query_description)}
              placeholder="Describe the customer's query..."
            />
            <FieldError id="callback-query_description" message={fieldErrors.query_description} />
          </div>
          <div>
            <label className={labelCls}>Possible Solution</label>
            <textarea rows={2} value={form.possible_solution} onChange={e => setForm({ ...form, possible_solution: e.target.value })}
              className={`${inputCls} resize-none`} placeholder="Proposed resolution..." />
          </div>
          {editing && (
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as CallbackStatus })} className={inputCls}>
                {(['pending', 'completed', 'cancelled', 'rescheduled'] as CallbackStatus[]).map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`${inputCls} resize-none`} />
          </div>
          <FormErrorBanner message={formError} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Schedule'}
            </button>
          </div>
        </form>
      </Modal>

      <DuplicateAssistanceModal
        open={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        records={duplicateRecords}
        canTakeOwnership
        onTakeOwnership={handleTakeOwnership}
        onContinueAnyway={handleContinueAnyway}
      />
    </>
  )
}
