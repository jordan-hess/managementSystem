'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import { updateBillingTicketStatusAction, type BillingTicketSummary } from '@/app/(app)/t2/actions'
import { BILLING_CHANNELS } from '@/lib/billing/constants'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

interface Props {
  open: boolean
  onClose: () => void
  ticket: BillingTicketSummary
  onSaved: () => void
}

const OTHER = 'Other'

// A ticket starts 'escalated' (createBillingTicketAction), but it's also a
// selectable transition now — a Follow Up ticket can be RE-escalated (e.g.
// a new issue comes up on it), at which point the agent sets/updates the
// escalation path below.
const STATUS_OPTIONS: { value: 'follow_up' | 'resolved' | 'escalated'; label: string }[] = [
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'escalated', label: 'Escalated' },
]

/**
 * A <select> with a fixed option list plus "Other" revealing a free-text
 * box. Copied from components/t2/CreateTicketModal.tsx / BillingTicketModal.tsx
 * (neither exports it) rather than extracted to a shared file, matching the
 * convention those two already established for this exact control.
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

const STATUS_LABELS: Record<string, string> = {
  escalated: 'Escalated', follow_up: 'Follow Up', resolved: 'Resolved',
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

function fmt(ts: string) {
  return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Billing tickets deliberately skip T2's full detail page (diagnostics,
 * outcome picker, solution review) — this is a lightweight status-only
 * editor, closer to how Social tickets work: pick a status (Follow Up /
 * Resolved / Escalated), save, done. There's no 'open' status — a ticket
 * starts life already 'escalated'. Re-selecting 'Escalated' (e.g. a Follow
 * Up ticket needs to go back out) asks for the Escalation Path too — the
 * same `channel` column/BILLING_CHANNELS set as ticket creation, just
 * editable again at this later point rather than fixed forever.
 */
export default function BillingStatusModal({ open, onClose, ticket, onSaved }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<'follow_up' | 'resolved' | 'escalated'>(
    ticket.status === 'follow_up' || ticket.status === 'resolved' || ticket.status === 'escalated' ? ticket.status : 'follow_up',
  )
  // Pre-filled from the ticket's current channel — re-escalating usually
  // means confirming/updating where it's going, not starting from blank.
  const [channel, setChannel] = useState<string | null>(ticket.channel)
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<'channel'>(['channel'])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    if (status === 'escalated' && !channel?.trim()) { setFieldErrors({ channel: 'Escalation path is required.' }); return }
    setSaving(true)
    const result = await updateBillingTicketStatusAction(ticket.id, status, status === 'escalated' ? channel! : undefined)
    setSaving(false)
    if (result.error) { applyActionError(result); return }
    router.refresh()
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Billing Ticket ${ticket.ticket_number}`}>
      <form onSubmit={handleSave} noValidate className="space-y-4">
        <div>
          <label className={labelCls}>Customer</label>
          <p className="text-sm text-gray-900 dark:text-white">
            {ticket.customer_name ? `${ticket.customer_name} — ${ticket.customer_phone}` : <span className="text-gray-400 dark:text-gray-600">No customer linked</span>}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Escalation Path</label>
            <p className="text-sm text-gray-900 dark:text-white">{ticket.channel ?? '—'}</p>
          </div>
          <div>
            <label className={labelCls}>Reason for Escalation</label>
            <p className="text-sm text-gray-900 dark:text-white">{ticket.issue_type ?? '—'}</p>
          </div>
        </div>
        {ticket.amount != null && (
          <div>
            <label className={labelCls}>Amount</label>
            <p className="text-sm text-gray-900 dark:text-white">R {Number(ticket.amount).toFixed(2)}</p>
          </div>
        )}
        {ticket.description && (
          <div>
            <label className={labelCls}>Description</label>
            <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{ticket.description}</p>
          </div>
        )}
        <div>
          <label className={labelCls}>Current status</label>
          <p className="text-sm text-gray-900 dark:text-white">{STATUS_LABELS[ticket.status] ?? ticket.status}</p>
        </div>
        <div>
          <label className={labelCls}>Set status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {status === 'escalated' && (
          <SelectWithOther label="Escalation Path *" options={BILLING_CHANNELS} value={channel} onChange={(v) => { setChannel(v); clearFieldError('channel') }} required id="billing-status-channel" error={fieldErrors.channel} />
        )}
        <FormErrorBanner message={formError} />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium">
            {saving ? 'Saving…' : 'Save Status'}
          </button>
        </div>

        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wide mb-2">History</h4>
          {ticket.events.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-600">No history yet.</p>
          ) : (
            <ol className="space-y-2 max-h-48 overflow-y-auto">
              {ticket.events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="text-gray-400 dark:text-gray-600 shrink-0 w-36">{fmt(e.created_at)}</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{e.user_name ?? 'System'}</span> — {e.event_type.replace(/_/g, ' ')}
                    {e.note && <span className="block text-gray-500 dark:text-gray-500 mt-0.5">{e.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </form>
    </Modal>
  )
}
