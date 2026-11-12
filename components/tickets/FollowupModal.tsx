'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import CustomerSearchField from './CustomerSearchField'
import { createFollowupAction, updateFollowupAction } from '@/app/(app)/support-tickets/actions'
import { queueOptionLabel } from '@/lib/queues/constants'
import { Followup, Priority, FollowupStatus, CaseCategory } from '@/types'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'
import { validateFollowup, FOLLOWUP_FIELDS, type FollowupField } from './FollowupModal.validation'

interface Props {
  open: boolean
  onClose: () => void
  customers: { id: string; name: string; phone: string }[]
  categories: CaseCategory[]
  // Department-scoped queue/channel options — see lib/queues/followupQueueOptions.ts.
  queueOptions: string[]
  editing?: Followup | null
  initialCustomerId?: string
  onSaved: () => void
}

const empty: { customer_id: string; query_description: string; possible_solution: string; priority: Priority; due_date: string; notes: string; status: FollowupStatus; category_id: string; cancellation_reason: string; collection_address: string; queue: string } = {
  customer_id: '', query_description: '', possible_solution: '', priority: 'normal',
  due_date: '', notes: '', status: 'open', category_id: '', cancellation_reason: '', collection_address: '', queue: '',
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

/**
 * Self-service Add-follow-up modal — mechanically extracted from
 * FollowupManager.tsx's own (non-privileged-branch) inline Modal (Phase 2).
 * Team Lead/Management assignment/editing keeps going through
 * components/followups/AssignFollowupModal.tsx (reused as-is) — that's a
 * distinct, wider form (assignee picker, status history, duplicate-check),
 * not this one.
 */
export default function FollowupModal({ open, onClose, customers, categories, queueOptions, editing, initialCustomerId, onSaved }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(editing ? {
    customer_id: editing.customer_id,
    query_description: editing.query_description,
    possible_solution: editing.possible_solution || '',
    priority: editing.priority,
    due_date: editing.due_date ? editing.due_date.slice(0, 16) : '',
    notes: editing.resolution_notes || '',
    status: editing.status,
    category_id: editing.category_id || '',
    cancellation_reason: editing.cancellation_reason || '',
    collection_address: editing.collection_address || '',
    queue: editing.queue ?? '',
  } : { ...empty, customer_id: initialCustomerId ?? '' })
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<FollowupField>(FOLLOWUP_FIELDS)

  const activeCategories = categories.filter(c => c.is_active)
  const isCancellation = categories.find(c => c.id === form.category_id)?.name.trim().toLowerCase() === 'cancellations'

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    const errs = validateFollowup(form, { isEditing: !!editing, isCancellation })
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    setSaving(true)
    const payload = {
      customer_id: form.customer_id,
      query_description: form.query_description,
      possible_solution: form.possible_solution || null,
      priority: form.priority,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      resolution_notes: form.notes || null,
      status: form.status,
      category_id: form.category_id || null,
      cancellation_reason: isCancellation ? form.cancellation_reason.trim() : null,
      collection_address: isCancellation ? (form.collection_address.trim() || null) : null,
      queue: form.queue || null,
    }
    const result = editing ? await updateFollowupAction(editing.id, payload) : await createFollowupAction(payload)
    setSaving(false)
    if (result.error) { applyActionError(result); return }
    router.refresh()
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Follow-up' : 'Add Follow-up'}>
      <form onSubmit={handleSave} noValidate className="space-y-4">
        <CustomerSearchField
          customers={customers}
          value={form.customer_id}
          onChange={(id) => { setForm({ ...form, customer_id: id }); clearFieldError('customer') }}
          required
          id="followup-modal-customer"
          error={fieldErrors.customer}
          disabled={!!initialCustomerId}
        />
        <div>
          <label className={labelCls}>Queue / Channel *</label>
          <select
            id="followup-modal-queue" required value={form.queue} onChange={e => { setForm({ ...form, queue: e.target.value }); clearFieldError('queue') }}
            className={fieldInputClass(inputCls, !!fieldErrors.queue)} {...fieldA11y('followup-modal-queue', fieldErrors.queue)}
          >
            <option value="">Select queue/channel...</option>
            {queueOptions.map(q => <option key={q} value={q}>{queueOptionLabel(q)}</option>)}
          </select>
          <FieldError id="followup-modal-queue" message={fieldErrors.queue} />
        </div>
        <div>
          <label className={labelCls}>Query Description *</label>
          <textarea
            id="followup-modal-query_description" required rows={3} value={form.query_description} onChange={e => { setForm({ ...form, query_description: e.target.value }); clearFieldError('query_description') }}
            className={`${fieldInputClass(inputCls, !!fieldErrors.query_description)} resize-none`} {...fieldA11y('followup-modal-query_description', fieldErrors.query_description)}
            placeholder="Describe the customer's issue..."
          />
          <FieldError id="followup-modal-query_description" message={fieldErrors.query_description} />
        </div>
        <div>
          <label className={labelCls}>Possible Solution</label>
          <textarea rows={2} value={form.possible_solution} onChange={e => setForm({ ...form, possible_solution: e.target.value })}
            className={`${inputCls} resize-none`} placeholder="Proposed resolution..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Priority</label>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Priority })} className={inputCls}>
              {(['low', 'normal', 'high', 'urgent'] as Priority[]).map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Due Date</label>
            <input type="datetime-local" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Category {!editing && '*'}</label>
          <select
            id="followup-modal-category" required={!editing} value={form.category_id} onChange={e => { setForm({ ...form, category_id: e.target.value }); clearFieldError('category') }}
            className={fieldInputClass(inputCls, !!fieldErrors.category)} {...fieldA11y('followup-modal-category', fieldErrors.category)}
          >
            <option value="">{editing ? 'Uncategorized' : 'Select category...'}</option>
            {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <FieldError id="followup-modal-category" message={fieldErrors.category} />
        </div>
        {editing && (
          <div>
            <label className={labelCls}>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as FollowupStatus })} className={inputCls}>
              {(['open', 'in_progress', 'resolved', 'closed'] as FollowupStatus[]).map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        )}
        {isCancellation && (
          <>
            <div>
              <label className={labelCls}>Reason for Cancellation *</label>
              <textarea
                id="followup-modal-cancellation_reason" required rows={2} value={form.cancellation_reason} onChange={e => { setForm({ ...form, cancellation_reason: e.target.value }); clearFieldError('cancellation_reason') }}
                className={`${fieldInputClass(inputCls, !!fieldErrors.cancellation_reason)} resize-none`} {...fieldA11y('followup-modal-cancellation_reason', fieldErrors.cancellation_reason)}
                placeholder="Why is the customer cancelling?"
              />
              <FieldError id="followup-modal-cancellation_reason" message={fieldErrors.cancellation_reason} />
            </div>
            <div>
              <label className={labelCls}>Collection Address</label>
              <input value={form.collection_address} onChange={e => setForm({ ...form, collection_address: e.target.value })}
                className={inputCls} placeholder="Address for equipment collection (optional)" />
            </div>
          </>
        )}
        <div>
          <label className={labelCls}>Resolution Notes</label>
          <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`${inputCls} resize-none`} />
        </div>
        <FormErrorBanner message={formError} />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium">
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Follow-up'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
