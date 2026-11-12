'use client'

import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import CustomerSearchField from '@/components/tickets/CustomerSearchField'
import ActiveAssistanceBanner from '@/components/active-assistance/ActiveAssistanceBanner'
import DuplicateAssistanceModal from '@/components/active-assistance/DuplicateAssistanceModal'
import { ActiveAssistanceRecord, Followup, FollowupStatus, FollowupAssignee, FollowupStatusHistory, CaseCategory } from '@/types'
import { format } from 'date-fns'
import { assignFollowupAction, reassignFollowupAction } from '@/app/(app)/support-tickets/actions'
import { createCustomerAction } from '@/lib/customers/actions'
import { sanitizePhoneInput } from '@/lib/customers/phone'
import { getActiveAssistanceAction, claimActiveAssistanceAction } from '@/lib/activeAssistance/actions'
import StatusHistoryTimeline from './StatusHistoryTimeline'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'
import { validateAssignFollowup, ASSIGN_FOLLOWUP_FIELDS, type AssignFollowupField } from './AssignFollowupModal.validation'

const NEW_CUSTOMER = '__new__'

interface Props {
  open: boolean
  onClose: () => void
  editing: Followup | null
  customers: { id: string; name: string; phone: string }[]
  agentCandidates: FollowupAssignee[]
  teamLeaderCandidates: { profile_id: string; profiles: (FollowupAssignee & { is_active: boolean }) | null }[]
  categories: CaseCategory[]
  history: FollowupStatusHistory[]
  userId: string
  onSaved: () => void
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export default function AssignFollowupModal({
  open, onClose, editing, customers, agentCandidates, teamLeaderCandidates, categories, history, userId, onSaved,
}: Props) {
  const [agentId, setAgentId] = useState(editing?.agent_id ?? '')
  const [customerId, setCustomerId] = useState(editing?.customer_id ?? '')
  const [queryDescription, setQueryDescription] = useState(editing?.query_description ?? '')
  const [status, setStatus] = useState<FollowupStatus>(editing?.status ?? 'open')
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? '')
  const [cancellationReason, setCancellationReason] = useState(editing?.cancellation_reason ?? '')
  const [collectionAddress, setCollectionAddress] = useState(editing?.collection_address ?? '')
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<AssignFollowupField>(ASSIGN_FOLLOWUP_FIELDS)
  const [editBanner, setEditBanner] = useState<ActiveAssistanceRecord[]>([])
  const [duplicateRecords, setDuplicateRecords] = useState<ActiveAssistanceRecord[]>([])
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [duplicateMode, setDuplicateMode] = useState<'precheck' | 'submit'>('precheck')
  const [dismissedForCustomer, setDismissedForCustomer] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !editing) { setEditBanner([]); return }
    let cancelled = false
    getActiveAssistanceAction(editing.customer_id).then(result => {
      if (!cancelled && !('error' in result)) setEditBanner(result.data)
    })
    return () => { cancelled = true }
  }, [open, editing])

  const activeCategories = categories.filter(c => c.is_active)
  const selectableCategories = categoryId && !activeCategories.some(c => c.id === categoryId)
    ? [...categories.filter(c => c.id === categoryId), ...activeCategories]
    : activeCategories
  const isCancellation = categories.find(c => c.id === categoryId)?.name.trim().toLowerCase() === 'cancellations'

  const teamLeaderOptions = useMemo(() => {
    const map = new Map<string, FollowupAssignee>()
    teamLeaderCandidates.forEach(tl => {
      const p = tl.profiles
      if (p && p.is_active && !map.has(p.id)) map.set(p.id, { id: p.id, full_name: p.full_name, email: p.email, department: null, t2_team: null })
    })
    return Array.from(map.values())
  }, [teamLeaderCandidates])

  if (!open) return null

  const isNewCustomer = customerId === NEW_CUSTOMER

  async function handleCustomerChange(value: string) {
    setCustomerId(value)
    clearFieldError('customer')
    if (editing || !value || value === NEW_CUSTOMER || value === dismissedForCustomer) return
    const result = await getActiveAssistanceAction(value)
    if (!('error' in result) && result.data.length > 0) {
      setDuplicateRecords(result.data)
      setDuplicateMode('precheck')
      setDuplicateModalOpen(true)
    }
  }

  function handleContinueAnyway() {
    setDuplicateModalOpen(false)
    if (duplicateMode === 'precheck') {
      setDismissedForCustomer(customerId)
    } else {
      handleSave(undefined, true)
    }
  }

  async function handleTakeOwnership(record: ActiveAssistanceRecord) {
    const result = await claimActiveAssistanceAction(record.sourceType, record.sourceId)
    if ('error' in result) { alert(`Could not take ownership: ${result.error}`); return }
    setDuplicateModalOpen(false)
    onSaved()
  }

  async function handleSave(e?: React.FormEvent, override = false) {
    e?.preventDefault()
    clearAll()
    const errs = validateAssignFollowup({
      agentId, customerId, isNewCustomer, newCustomerName, newCustomerPhone, newCustomerEmail,
      queryDescription, categoryId, cancellationReason, isCancellation, isEditing: !!editing,
    })
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    setSaving(true)

    let finalCustomerId = customerId
    if (isNewCustomer) {
      const custResult = await createCustomerAction(newCustomerName.trim(), newCustomerPhone.trim(), newCustomerEmail.trim())
      if (custResult.error || !custResult.data) {
        applyActionError({ error: custResult.error ?? 'Could not create customer.', field: custResult.field }, { name: 'new_name', phone: 'new_phone', email: 'new_email' })
        setSaving(false)
        return
      }
      finalCustomerId = custResult.data.id
    }

    const payload = {
      customer_id: finalCustomerId,
      query_description: queryDescription,
      possible_solution: editing?.possible_solution ?? null,
      priority: editing?.priority ?? 'normal',
      due_date: editing?.due_date ?? null,
      resolution_notes: editing?.resolution_notes ?? null,
      category_id: categoryId || null,
      cancellation_reason: isCancellation ? cancellationReason.trim() : null,
      collection_address: isCancellation ? (collectionAddress.trim() || null) : null,
      // This privileged assign/reassign form has no queue/channel field of
      // its own (out of scope — see FollowupModal.tsx/CallbackModal.tsx for
      // where it's actually offered). Only present to satisfy
      // FollowupSaveInput's shape — reassignFollowupAction's UPDATE doesn't
      // reference this field, so an edited record's existing queue (if any)
      // is left untouched regardless of what's passed here.
      queue: editing?.queue ?? null,
    }
    const customerLabel = isNewCustomer ? newCustomerName.trim() : customers.find(c => c.id === finalCustomerId)?.name ?? ''

    // Leaving "Assign to" on Myself keeps the follow-up with the creator.
    const assigneeId = agentId || userId
    const result = editing
      ? await reassignFollowupAction(editing.id, { ...payload, agent_id: assigneeId, status, customerLabel })
      : await assignFollowupAction({ ...payload, agent_id: assigneeId, status: 'open', customerLabel }, override)

    setSaving(false)
    if ('duplicates' in result && result.duplicates) {
      setDuplicateRecords(result.duplicates)
      setDuplicateMode('submit')
      setDuplicateModalOpen(true)
      return
    }
    if (result.error) { applyActionError(result); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Follow-up' : 'Add Follow-up'}>
      <form onSubmit={handleSave} noValidate className="space-y-4">
        {editing && <ActiveAssistanceBanner records={editBanner} excludeSourceId={editing.id} variant="banner" />}
        <div>
          <label className={labelCls}>Assign to</label>
          <select
            id="followup-agent" value={agentId} onChange={e => { setAgentId(e.target.value); clearFieldError('agent') }}
            className={fieldInputClass(inputCls, !!fieldErrors.agent)} {...fieldA11y('followup-agent', fieldErrors.agent)}
          >
            <option value="">Myself</option>
            <optgroup label="Agents">
              {agentCandidates.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </optgroup>
            <optgroup label="Team Leaders">
              {teamLeaderOptions.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
            </optgroup>
          </select>
          <FieldError id="followup-agent" message={fieldErrors.agent} />
        </div>

        <CustomerSearchField
          customers={customers}
          value={customerId}
          onChange={handleCustomerChange}
          required
          id="followup-customer"
          error={fieldErrors.customer}
          extraOption={{ value: NEW_CUSTOMER, label: '+ New Customer' }}
          selectedLabelOverride={(v) => (v === NEW_CUSTOMER ? 'New customer' : null)}
        />

        {isNewCustomer && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Full Name *</label>
              <input
                id="followup-new_name" required value={newCustomerName} onChange={e => { setNewCustomerName(e.target.value); clearFieldError('new_name') }}
                className={fieldInputClass(inputCls, !!fieldErrors.new_name)} {...fieldA11y('followup-new_name', fieldErrors.new_name)}
              />
              <FieldError id="followup-new_name" message={fieldErrors.new_name} />
            </div>
            <div>
              <label className={labelCls}>Phone Number *</label>
              <input
                id="followup-new_phone" required type="tel" inputMode="tel" value={newCustomerPhone} onChange={e => { setNewCustomerPhone(sanitizePhoneInput(e.target.value)); clearFieldError('new_phone') }}
                className={fieldInputClass(inputCls, !!fieldErrors.new_phone)} {...fieldA11y('followup-new_phone', fieldErrors.new_phone)}
              />
              <FieldError id="followup-new_phone" message={fieldErrors.new_phone} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Email *</label>
              <input
                id="followup-new_email" required type="email" value={newCustomerEmail} onChange={e => { setNewCustomerEmail(e.target.value); clearFieldError('new_email') }}
                className={fieldInputClass(inputCls, !!fieldErrors.new_email)} {...fieldA11y('followup-new_email', fieldErrors.new_email)}
              />
              <FieldError id="followup-new_email" message={fieldErrors.new_email} />
            </div>
          </div>
        )}

        <div>
          <label className={labelCls}>Query Description *</label>
          <textarea
            id="followup-query_description" required rows={3} value={queryDescription} onChange={e => { setQueryDescription(e.target.value); clearFieldError('query_description') }}
            className={`${fieldInputClass(inputCls, !!fieldErrors.query_description)} resize-none`} {...fieldA11y('followup-query_description', fieldErrors.query_description)}
            placeholder="Describe the customer's issue..."
          />
          <FieldError id="followup-query_description" message={fieldErrors.query_description} />
        </div>

        <div>
          <label className={labelCls}>Category {!editing && '*'}</label>
          <select
            id="followup-category" required={!editing} value={categoryId} onChange={e => { setCategoryId(e.target.value); clearFieldError('category') }}
            className={fieldInputClass(inputCls, !!fieldErrors.category)} {...fieldA11y('followup-category', fieldErrors.category)}
          >
            <option value="">{editing ? 'Uncategorized' : 'Select category...'}</option>
            {selectableCategories.map(c => <option key={c.id} value={c.id}>{c.name}{!c.is_active ? ' (inactive)' : ''}</option>)}
          </select>
          <FieldError id="followup-category" message={fieldErrors.category} />
        </div>

        {isCancellation && (
          <>
            <div>
              <label className={labelCls}>Reason for Cancellation *</label>
              <textarea
                id="followup-cancellation_reason" required rows={2} value={cancellationReason} onChange={e => { setCancellationReason(e.target.value); clearFieldError('cancellation_reason') }}
                className={`${fieldInputClass(inputCls, !!fieldErrors.cancellation_reason)} resize-none`} {...fieldA11y('followup-cancellation_reason', fieldErrors.cancellation_reason)}
                placeholder="Why is the customer cancelling?"
              />
              <FieldError id="followup-cancellation_reason" message={fieldErrors.cancellation_reason} />
            </div>
            <div>
              <label className={labelCls}>Collection Address</label>
              <input value={collectionAddress} onChange={e => setCollectionAddress(e.target.value)}
                className={inputCls} placeholder="Address for equipment collection (optional)" />
            </div>
          </>
        )}

        {editing ? (
          <div>
            <label className={labelCls}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as FollowupStatus)} className={inputCls}>
              {['open', 'in_progress', 'resolved', 'closed'].map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">Assigned {format(new Date(), 'dd MMM yyyy')}</p>
        )}

        {editing && (
          <div>
            <p className={labelCls}>Status History</p>
            <StatusHistoryTimeline items={history} />
          </div>
        )}

        <FormErrorBanner message={formError} />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium">
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Follow-up'}
          </button>
        </div>
      </form>

      <DuplicateAssistanceModal
        open={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        records={duplicateRecords}
        canTakeOwnership
        onTakeOwnership={handleTakeOwnership}
        onContinueAnyway={handleContinueAnyway}
      />
    </Modal>
  )
}
