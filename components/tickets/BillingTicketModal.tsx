'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { createBillingTicketAction } from '@/app/(app)/t2/actions'
import { BILLING_CHANNELS, BILLING_REASONS, BILLING_AMOUNT_REASONS } from '@/lib/billing/constants'
import { useFormErrors, type FieldErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type BillingField = 'channel' | 'reason' | 'amount'
const BILLING_FIELDS: readonly BillingField[] = ['channel', 'reason', 'amount']

const OTHER = 'Other'

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'

/**
 * A <select> with a fixed option list plus "Other" revealing a free-text
 * box — the value ultimately stored is either the picked option, or the
 * free text typed for Other. Copied from components/t2/CreateTicketModal.tsx
 * (not exported there) rather than imported, to keep this file's diff
 * self-contained per the Task 3 brief.
 */
function SelectWithOther({
  label, options, value, onChange, required = false, id, error,
}: {
  label: string
  options: readonly string[]
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

interface Props {
  onClose: () => void
  customerId: string
  onSaved: () => void
}

/**
 * Billing queue ticket creation — a small flat form (channel, reason,
 * conditional amount, description). The customer is already resolved by
 * CreateTicketOrchestrator before this renders, so unlike
 * components/t2/CreateTicketModal.tsx (which owns its own customer search
 * for its non-orchestrated callers), there's no customer picker here.
 */
export default function BillingTicketModal({ onClose, customerId, onSaved }: Props) {
  const [channel, setChannel] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, setFormError, clearAll, applyActionError } = useFormErrors<BillingField>(BILLING_FIELDS)

  const showAmount = BILLING_AMOUNT_REASONS.includes(reason)

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault()
    clearAll()
    const errs: FieldErrors<BillingField> = {}
    if (!channel?.trim()) errs.channel = 'Channel is required.'
    if (!reason) errs.reason = 'Reason for follow-up is required.'
    if (showAmount && !amount) errs.amount = 'Amount is required for this reason.'
    if (Object.keys(errs).length > 0 || !channel) { setFieldErrors(errs); return }

    setSaving(true)
    const result = await createBillingTicketAction({
      customer_id: customerId,
      channel,
      reason_for_followup: reason,
      amount: showAmount ? Number(amount) : null,
      description: description.trim() || null,
    })
    setSaving(false)
    if (result.error) { applyActionError(result); return }
    if (result.duplicates) {
      setFormError('An active ticket already exists for this customer — please check existing tickets before continuing.')
      return
    }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="New Billing Ticket">
      <form onSubmit={handleSave} noValidate className="space-y-3">
        <SelectWithOther
          label="Channel"
          options={BILLING_CHANNELS}
          value={channel}
          onChange={(v) => { setChannel(v); clearFieldError('channel') }}
          required
          id="billing-channel"
          error={fieldErrors.channel}
        />
        <div>
          <label className={labelCls}>Reason for follow-up</label>
          <select
            id="billing-reason" required className={fieldInputClass(inputCls, !!fieldErrors.reason)} {...fieldA11y('billing-reason', fieldErrors.reason)}
            value={reason} onChange={(e) => { setReason(e.target.value); clearFieldError('reason') }}
          >
            <option value="">Select…</option>
            {BILLING_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <FieldError id="billing-reason" message={fieldErrors.reason} />
        </div>
        {showAmount && (
          <div>
            <label className={labelCls}>Amount</label>
            <input
              id="billing-amount" type="number" min="0" step="0.01" required
              className={fieldInputClass(inputCls, !!fieldErrors.amount)} {...fieldA11y('billing-amount', fieldErrors.amount)}
              value={amount}
              onChange={(e) => { setAmount(e.target.value); clearFieldError('amount') }}
            />
            <FieldError id="billing-amount" message={fieldErrors.amount} />
          </div>
        )}
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <FormErrorBanner message={formError} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg" disabled={saving}>
            {saving ? 'Creating…' : 'Create ticket'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
