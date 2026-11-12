'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import ActiveAssistanceBanner from '@/components/active-assistance/ActiveAssistanceBanner'
import DuplicateAssistanceModal from '@/components/active-assistance/DuplicateAssistanceModal'
import {
  createSupportTicketAction, updateSupportTicketAction, getSupportTicketStatusHistoryAction,
  type SupportTicketSaveInput,
} from '@/app/(app)/support-tickets/actions'
import { getActiveAssistanceAction, claimActiveAssistanceAction } from '@/lib/activeAssistance/actions'
import { SUPPORT_TICKET_ESCALATION_DESTINATIONS, ESCALATION_OTHER, SOCIAL_QUERY_TYPES, SOCIAL_ISSUE_TYPES_BY_QUERY_TYPE, SOCIAL_ROOT_CAUSES_BY_QUERY_TYPE } from '@/lib/tickets/constants'
import { statusBadgeClass } from './statusBadges'
import { ActiveAssistanceRecord, SupportTicket, SupportTicketChannel, SupportTicketStatus, SupportTicketStatusHistory, Priority, FollowupAssignee } from '@/types'
import { format } from 'date-fns'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'
import CustomerSearchField from './CustomerSearchField'
import { validateSupportTicket, SUPPORT_TICKET_FIELDS, type SupportTicketField } from './SupportTicketModal.validation'

export const CHANNEL_CONFIG: Record<SupportTicketChannel, { label: string }> = {
  freescout: { label: 'Freescout' },
  whatsapp: { label: 'WhatsApp' },
  hellopeter: { label: 'HelloPeter' },
  mybroadband: { label: 'MyBroadband' },
  pissedcustomer: { label: 'PissedCustomer' },
}

// The statuses a Social agent picks going forward — 'open' is the
// creation-time default (never manually re-selected) and 'closed' has no
// selectable path here (see support-tickets-status-fields.sql's comment);
// both remain valid historical status values, just not offered by this control.
const STATUS_OPTIONS: SupportTicketStatus[] = ['in_progress', 'resolved', 'escalated', 'follow_up', 'callback']

interface Props {
  open: boolean
  onClose: () => void
  editing: SupportTicket | null
  customers: { id: string; name: string; phone: string; email?: string | null }[]
  agentCandidates: FollowupAssignee[]
  userId: string
  canAssign: boolean
  initialCustomerId?: string
  initialChannel?: SupportTicketChannel
  onSaved: () => void
}

/** Splits a timestamptz into the separate <input type="date">/<input type="time"> values the status fields use. */
function splitDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  return { date: format(d, 'yyyy-MM-dd'), time: format(d, 'HH:mm') }
}

/** Combines the two fields back into one timestamptz for storage — mirrors callbacks.scheduled_at's shape. */
function combineDateTime(date: string, time: string): string | null {
  if (!date || !time) return null
  const combined = new Date(`${date}T${time}`)
  return Number.isNaN(combined.getTime()) ? null : combined.toISOString()
}

const empty = {
  customer_id: '', agent_id: '', channel: 'freescout' as SupportTicketChannel, reference: '',
  query_description: '', query_type: '', priority: 'normal' as Priority, due_date: '', status: 'open' as SupportTicketStatus, notes: '',
  escalationChoice: '', escalationOtherText: '', escalationNotes: '',
  followupNotes: '', followupDate: '', followupTime: '',
  callbackNotes: '', callbackDate: '', callbackTime: '',
  issueType: '', rootCause: '',
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

function initialFormState(editing: SupportTicket | null, initialCustomerId: string | undefined, initialChannel: SupportTicketChannel | undefined, canAssign: boolean, userId: string) {
  if (!editing) return { ...empty, customer_id: initialCustomerId ?? '', channel: initialChannel ?? empty.channel, agent_id: canAssign ? '' : userId }

  const isOtherDestination = !!editing.escalation_destination && !(SUPPORT_TICKET_ESCALATION_DESTINATIONS as readonly string[]).includes(editing.escalation_destination)
  const followup = splitDateTime(editing.followup_scheduled_at)
  const callback = splitDateTime(editing.callback_scheduled_at)

  return {
    customer_id: editing.customer_id,
    agent_id: editing.agent_id ?? '',
    channel: editing.channel,
    reference: editing.reference || '',
    query_description: editing.query_description,
    query_type: editing.query_type || '',
    priority: editing.priority,
    due_date: editing.due_date ? editing.due_date.slice(0, 10) : '',
    status: editing.status,
    notes: editing.resolution_notes || '',
    escalationChoice: isOtherDestination ? ESCALATION_OTHER : (editing.escalation_destination ?? ''),
    escalationOtherText: isOtherDestination ? editing.escalation_destination! : '',
    escalationNotes: editing.escalation_notes || '',
    followupNotes: editing.followup_notes || '', followupDate: followup.date, followupTime: followup.time,
    callbackNotes: editing.callback_notes || '', callbackDate: callback.date, callbackTime: callback.time,
    issueType: editing.issue_type || '', rootCause: editing.root_cause || '',
  }
}

/** Add/Edit modal for support_tickets — mechanically extracted from SupportTicketManager.tsx (Phase 2), same form/duplicate-check logic, no longer coupled to a manager that also owns its own list. */
export default function SupportTicketModal({ open, onClose, editing, customers, agentCandidates, userId, canAssign, initialCustomerId, initialChannel, onSaved }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(() => initialFormState(editing, initialCustomerId, initialChannel, canAssign, userId))
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<SupportTicketField>(SUPPORT_TICKET_FIELDS)
  const [editBanner, setEditBanner] = useState<ActiveAssistanceRecord[]>([])
  const [history, setHistory] = useState<SupportTicketStatusHistory[]>([])
  const [duplicateRecords, setDuplicateRecords] = useState<ActiveAssistanceRecord[]>([])
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [duplicateMode, setDuplicateMode] = useState<'precheck' | 'submit'>('precheck')
  const [dismissedForCustomer, setDismissedForCustomer] = useState<string | null>(null)
  const ticketCustomer = editing ? customers.find(c => c.id === editing.customer_id) : undefined

  const availableIssueTypes = form.query_type ? SOCIAL_ISSUE_TYPES_BY_QUERY_TYPE[form.query_type as keyof typeof SOCIAL_ISSUE_TYPES_BY_QUERY_TYPE] ?? [] : []
  const availableRootCauses = form.query_type ? SOCIAL_ROOT_CAUSES_BY_QUERY_TYPE[form.query_type as keyof typeof SOCIAL_ROOT_CAUSES_BY_QUERY_TYPE] ?? [] : []

  useEffect(() => {
    if (!editing) return
    let cancelled = false
    getActiveAssistanceAction(editing.customer_id).then((result) => {
      if (!cancelled && result.data) setEditBanner(result.data)
    })
    getSupportTicketStatusHistoryAction(editing.id).then((result) => {
      if (!cancelled && result.data) setHistory(result.data)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id])

  /** Form key -> the error field it feeds, so editing an input clears just its own error. */
  const ERROR_FIELD_BY_KEY: Partial<Record<keyof typeof form, SupportTicketField>> = {
    customer_id: 'customer', agent_id: 'agent', query_description: 'query_description', query_type: 'query_type', issueType: 'issue_type',
    escalationChoice: 'escalation', escalationOtherText: 'escalation_other',
    followupDate: 'followup_date', followupTime: 'followup_time', followupNotes: 'followup_notes',
    callbackDate: 'callback_date', callbackTime: 'callback_time', callbackNotes: 'callback_notes',
  }
  function update(patch: Partial<typeof form>) {
    setForm(f => ({ ...f, ...patch }))
    for (const key of Object.keys(patch) as (keyof typeof form)[]) {
      const field = ERROR_FIELD_BY_KEY[key]
      if (field) clearFieldError(field)
    }
  }

  async function handleCustomerChange(customerId: string) {
    update({ customer_id: customerId })
    if (editing || !customerId || customerId === dismissedForCustomer) return
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
    const errs = validateSupportTicket(form)
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    setSaving(true)

    const payload: SupportTicketSaveInput = {
      customer_id: form.customer_id,
      // Leaving "Assign to" on Myself creates the ticket for the creator.
      agent_id: canAssign ? (form.agent_id || userId) : userId,
      channel: form.channel,
      reference: form.reference.trim() || null,
      query_description: form.query_description,
      query_type: form.query_type || null,
      issue_type: form.issueType.trim() || null,
      root_cause: form.rootCause.trim() || null,
      priority: form.priority,
      due_date: form.due_date || null,
      status: form.status,
      resolution_notes: form.notes || null,
      escalation_destination: form.status === 'escalated'
        ? (form.escalationChoice === ESCALATION_OTHER ? form.escalationOtherText.trim() : form.escalationChoice)
        : null,
      escalation_notes: form.status === 'escalated' ? (form.escalationNotes.trim() || null) : null,
      followup_notes: form.status === 'follow_up' ? form.followupNotes.trim() : null,
      followup_scheduled_at: form.status === 'follow_up' ? combineDateTime(form.followupDate, form.followupTime) : null,
      callback_notes: form.status === 'callback' ? form.callbackNotes.trim() : null,
      callback_scheduled_at: form.status === 'callback' ? combineDateTime(form.callbackDate, form.callbackTime) : null,
    }

    const result = editing
      ? await updateSupportTicketAction(editing.id, payload)
      : await createSupportTicketAction(payload, override)

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
      <Modal open={open} onClose={onClose} title={editing ? 'Edit Ticket' : 'Add Ticket'}>
        <form onSubmit={handleSave} noValidate className="space-y-4">
          {editing && <ActiveAssistanceBanner records={editBanner} excludeSourceId={editing.id} variant="banner" />}
          {editing ? (
            // A ticket belongs to the customer it was raised for and is part of that
            // customer's history, so on edit the customer is shown, never changeable.
            <div>
              <label className={labelCls}>Customer</label>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm space-y-0.5">
                <p className="font-medium text-gray-900 dark:text-white">{ticketCustomer?.name ?? 'Unknown customer'}</p>
                <p className="text-gray-600 dark:text-gray-400">{ticketCustomer?.phone || '—'}</p>
                <p data-testid="ticket-customer-email" className="text-gray-600 dark:text-gray-400">{ticketCustomer?.email || '—'}</p>
              </div>
            </div>
          ) : (
            <CustomerSearchField
              customers={customers}
              value={form.customer_id}
              onChange={handleCustomerChange}
              label="Customer"
              required
              id="support-customer"
              error={fieldErrors.customer}
              disabled={!!initialCustomerId}
            />
          )}
          {canAssign && (
            <div>
              <label className={labelCls}>Assign to</label>
              <select
                id="support-agent" value={form.agent_id} onChange={e => update({ agent_id: e.target.value })}
                className={fieldInputClass(inputCls, !!fieldErrors.agent)} {...fieldA11y('support-agent', fieldErrors.agent)}
              >
                <option value="">Myself</option>
                {agentCandidates.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
              <FieldError id="support-agent" message={fieldErrors.agent} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Channel *</label>
              <select required value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as SupportTicketChannel })} className={inputCls}>
                {(Object.keys(CHANNEL_CONFIG) as SupportTicketChannel[]).map(c => <option key={c} value={c}>{CHANNEL_CONFIG[c].label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Reference / Ticket #</label>
              <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} className={inputCls} placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Query</label>
            <select
              id="support-query_type"
              value={form.query_type}
              {...fieldA11y('support-query_type', fieldErrors.query_type)}
              onChange={e => {
                const nextQueryType = e.target.value
                const nextIssueTypes = SOCIAL_ISSUE_TYPES_BY_QUERY_TYPE[nextQueryType as keyof typeof SOCIAL_ISSUE_TYPES_BY_QUERY_TYPE] ?? []
                const nextRootCauses = SOCIAL_ROOT_CAUSES_BY_QUERY_TYPE[nextQueryType as keyof typeof SOCIAL_ROOT_CAUSES_BY_QUERY_TYPE] ?? []
                update({
                  query_type: nextQueryType,
                  issueType: nextIssueTypes.includes(form.issueType) ? form.issueType : '',
                  rootCause: nextRootCauses.includes(form.rootCause) ? form.rootCause : '',
                })
              }}
              className={fieldInputClass(inputCls, !!fieldErrors.query_type)}
            >
              <option value="">Select query type...</option>
              {SOCIAL_QUERY_TYPES.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
            <FieldError id="support-query_type" message={fieldErrors.query_type} />
          </div>
          <div>
            <label className={labelCls}>Query Description *</label>
            <textarea
              id="support-query_description" required rows={3} value={form.query_description} onChange={e => update({ query_description: e.target.value })}
              className={`${fieldInputClass(inputCls, !!fieldErrors.query_description)} resize-none`} {...fieldA11y('support-query_description', fieldErrors.query_description)}
              placeholder="Describe the customer's issue..."
            />
            <FieldError id="support-query_description" message={fieldErrors.query_description} />
          </div>
          {editing && (
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as SupportTicketStatus })} className={inputCls}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          )}

          {editing && form.status === 'escalated' && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
              <div>
                <label className={labelCls}>Escalate to *</label>
                <select
                  id="support-escalation" required value={form.escalationChoice} onChange={e => update({ escalationChoice: e.target.value })}
                  className={fieldInputClass(inputCls, !!fieldErrors.escalation)} {...fieldA11y('support-escalation', fieldErrors.escalation)}
                >
                  <option value="">Select destination...</option>
                  {SUPPORT_TICKET_ESCALATION_DESTINATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  <option value={ESCALATION_OTHER}>{ESCALATION_OTHER}</option>
                </select>
                <FieldError id="support-escalation" message={fieldErrors.escalation} />
                {form.escalationChoice === ESCALATION_OTHER && (
                  <>
                    <input
                      id="support-escalation_other" required value={form.escalationOtherText} onChange={e => update({ escalationOtherText: e.target.value })}
                      className={`${fieldInputClass(inputCls, !!fieldErrors.escalation_other)} mt-2`} {...fieldA11y('support-escalation_other', fieldErrors.escalation_other)}
                      placeholder="Specify destination"
                    />
                    <FieldError id="support-escalation_other" message={fieldErrors.escalation_other} />
                  </>
                )}
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea rows={2} value={form.escalationNotes} onChange={e => setForm({ ...form, escalationNotes: e.target.value })}
                  className={`${inputCls} resize-none`} placeholder="Additional notes (optional)" />
              </div>
            </div>
          )}

          {editing && form.status === 'follow_up' && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Follow-up Date *</label>
                  <input
                    id="support-followup_date" required type="date" value={form.followupDate} onChange={e => update({ followupDate: e.target.value })}
                    className={fieldInputClass(inputCls, !!fieldErrors.followup_date)} {...fieldA11y('support-followup_date', fieldErrors.followup_date)}
                  />
                  <FieldError id="support-followup_date" message={fieldErrors.followup_date} />
                </div>
                <div>
                  <label className={labelCls}>Follow-up Time *</label>
                  <input
                    id="support-followup_time" required type="time" value={form.followupTime} onChange={e => update({ followupTime: e.target.value })}
                    className={fieldInputClass(inputCls, !!fieldErrors.followup_time)} {...fieldA11y('support-followup_time', fieldErrors.followup_time)}
                  />
                  <FieldError id="support-followup_time" message={fieldErrors.followup_time} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Follow-up Notes *</label>
                <textarea
                  id="support-followup_notes" required rows={2} value={form.followupNotes} onChange={e => update({ followupNotes: e.target.value })}
                  className={`${fieldInputClass(inputCls, !!fieldErrors.followup_notes)} resize-none`} {...fieldA11y('support-followup_notes', fieldErrors.followup_notes)}
                />
                <FieldError id="support-followup_notes" message={fieldErrors.followup_notes} />
              </div>
            </div>
          )}

          {editing && form.status === 'callback' && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Callback Date *</label>
                  <input
                    id="support-callback_date" required type="date" value={form.callbackDate} onChange={e => update({ callbackDate: e.target.value })}
                    className={fieldInputClass(inputCls, !!fieldErrors.callback_date)} {...fieldA11y('support-callback_date', fieldErrors.callback_date)}
                  />
                  <FieldError id="support-callback_date" message={fieldErrors.callback_date} />
                </div>
                <div>
                  <label className={labelCls}>Callback Time *</label>
                  <input
                    id="support-callback_time" required type="time" value={form.callbackTime} onChange={e => update({ callbackTime: e.target.value })}
                    className={fieldInputClass(inputCls, !!fieldErrors.callback_time)} {...fieldA11y('support-callback_time', fieldErrors.callback_time)}
                  />
                  <FieldError id="support-callback_time" message={fieldErrors.callback_time} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Callback Notes *</label>
                <textarea
                  id="support-callback_notes" required rows={2} value={form.callbackNotes} onChange={e => update({ callbackNotes: e.target.value })}
                  className={`${fieldInputClass(inputCls, !!fieldErrors.callback_notes)} resize-none`} {...fieldA11y('support-callback_notes', fieldErrors.callback_notes)}
                />
                <FieldError id="support-callback_notes" message={fieldErrors.callback_notes} />
              </div>
            </div>
          )}

          {editing && (form.status === 'resolved' || form.status === 'closed' || form.issueType || form.rootCause) && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
              {availableIssueTypes.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">Select a Query above to choose Issue Type and Root Cause.</p>
              ) : (
                <>
                  <div>
                    <label className={labelCls}>Issue Type {form.status === 'resolved' && '*'}</label>
                    <select
                      id="support-issue_type" required={form.status === 'resolved'} value={form.issueType} onChange={e => update({ issueType: e.target.value })}
                      className={fieldInputClass(inputCls, !!fieldErrors.issue_type)} {...fieldA11y('support-issue_type', fieldErrors.issue_type)}
                    >
                      <option value="">Select issue type...</option>
                      {availableIssueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <FieldError id="support-issue_type" message={fieldErrors.issue_type} />
                  </div>
                  <div>
                    <label className={labelCls}>Root Cause</label>
                    <select value={form.rootCause} onChange={e => setForm({ ...form, rootCause: e.target.value })} className={inputCls}>
                      <option value="">Select root cause (optional)...</option>
                      {availableRootCauses.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {editing && (
            <div>
              <label className={labelCls}>Resolution Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`${inputCls} resize-none`} />
            </div>
          )}

          {editing && history.length > 0 && (
            <div>
              <p className={labelCls}>Status History</p>
              <div className="space-y-1.5">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${statusBadgeClass('support_ticket', h.from_status)}`}>{h.from_status.replace('_', ' ')}</span>
                    <span className="text-gray-400">→</span>
                    <span className={`px-1.5 py-0.5 rounded font-medium ${statusBadgeClass('support_ticket', h.to_status)}`}>{h.to_status.replace('_', ' ')}</span>
                    <span className="text-gray-400 dark:text-gray-500">
                      {h.profiles?.full_name ? `by ${h.profiles.full_name}, ` : ''}{format(new Date(h.changed_at), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <FormErrorBanner message={formError} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Ticket'}
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
