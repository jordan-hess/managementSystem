'use client'

import { useState } from 'react'
import { createWarningAction, updateWarningAction } from '@/app/(app)/qa-reviews/warningsActions'
import Modal from '@/components/ui/Modal'
import { Warning, WarningTargetCandidate, WarningType } from '@/types'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type WarningField = 'target' | 'reason' | 'next_steps'
const WARNING_FIELDS: readonly WarningField[] = ['target', 'reason', 'next_steps']

interface Props {
  open: boolean
  onClose: () => void
  editing: Warning | null
  targetCandidates: WarningTargetCandidate[]
  currentUserId: string
  onSaved: () => void
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export default function WarningModal({ open, onClose, editing, targetCandidates, currentUserId, onSaved }: Props) {
  const [targetId, setTargetId] = useState(editing?.issued_to ?? '')
  const [type, setType] = useState<WarningType>(editing?.type ?? 'verbal')
  const [reason, setReason] = useState(editing?.reason ?? '')
  const [nextSteps, setNextSteps] = useState(editing?.next_steps ?? '')
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<WarningField>(WARNING_FIELDS)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    const errs: Partial<Record<WarningField, string>> = {}
    if (!editing && !targetId) errs.target = 'Please select who this warning is for.'
    if (!reason.trim()) errs.reason = 'Reason is required.'
    if (!nextSteps.trim()) errs.next_steps = 'Next steps are required.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    setSaving(true)

    try {
      if (editing) {
        await updateWarningAction(editing.id, { type, reason, nextSteps })
      } else {
        await createWarningAction({ issuedTo: targetId, type, reason, nextSteps })
      }
    } catch (err) {
      applyActionError({ error: err instanceof Error ? err.message : 'Failed to save warning.' })
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Warning' : 'New Warning'}>
      <form onSubmit={handleSave} noValidate className="space-y-4">
        <div>
          <label className={labelCls}>Warning For *</label>
          <select
            id="warning-target" required
            disabled={!!editing}
            value={targetId}
            onChange={e => { setTargetId(e.target.value); clearFieldError('target') }}
            className={`${fieldInputClass(inputCls, !!fieldErrors.target)} disabled:opacity-60 disabled:cursor-not-allowed`}
            {...fieldA11y('warning-target', fieldErrors.target)}
          >
            <option value="">Select...</option>
            {targetCandidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          <FieldError id="warning-target" message={fieldErrors.target} />
        </div>

        <div>
          <label className={labelCls}>Type *</label>
          <select required value={type} onChange={e => setType(e.target.value as WarningType)} className={inputCls}>
            <option value="verbal">Verbal</option>
            <option value="written">Written</option>
            <option value="final">Final</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Reason *</label>
          <textarea
            id="warning-reason" required
            rows={4}
            value={reason}
            onChange={e => { setReason(e.target.value); clearFieldError('reason') }}
            className={`${fieldInputClass(inputCls, !!fieldErrors.reason)} resize-none`}
            {...fieldA11y('warning-reason', fieldErrors.reason)}
            placeholder="Describe the reason for this warning..."
          />
          <FieldError id="warning-reason" message={fieldErrors.reason} />
        </div>

        <div>
          <label className={labelCls}>Next Steps *</label>
          <textarea
            id="warning-next_steps" required
            rows={3}
            value={nextSteps}
            onChange={e => { setNextSteps(e.target.value); clearFieldError('next_steps') }}
            className={`${fieldInputClass(inputCls, !!fieldErrors.next_steps)} resize-none`}
            {...fieldA11y('warning-next_steps', fieldErrors.next_steps)}
            placeholder="What happens moving forward — expectations, follow-up, timeline..."
          />
          <FieldError id="warning-next_steps" message={fieldErrors.next_steps} />
        </div>

        <FormErrorBanner message={formError} />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium">
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Issue Warning'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
