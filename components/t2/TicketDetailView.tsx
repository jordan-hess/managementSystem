'use client'

// T2 Queue Hub merge, Phase 2 — interactive ticket detail. Ported from
// t2-queue-hub/frontend/src/pages/TicketDetail.jsx: same Outcome-selector
// flow (mirrors the team's legacy MS Forms question, pre-fills whichever
// action form it implies), same escalation/validation state machine.
// Calls the Server Actions in app/(app)/t2/actions.ts instead of REST calls
// through frontend/src/api.js, and router.refresh() instead of local
// re-fetch + Socket.io (no realtime push post-merge — see actions.ts's
// header comment).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ticket, TicketEscalation, TicketEvent, TicketSolution } from '@/lib/t2/types'
import { StatusBadge } from './Badges'
import ActiveAssistanceBanner from '@/components/active-assistance/ActiveAssistanceBanner'
import { ActiveAssistanceRecord } from '@/types'
import {
  addTicketNoteAction, updateDiagnosticsAction, solveTicketAction, escalateTicketAction,
  acknowledgeEscalationAction, respondEscalationAction, validateEscalationAction,
  reassignCallbackTicketAction, closeTicketAction, reviewSolutionAction,
  type DiagnosticsInput, type SolveInput, type EscalateInput,
} from '@/app/(app)/t2/actions'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'
import {
  validateSolve, validateEscalate, validateReassign, validateRespond, validateEditedSolution,
  TICKET_DETAIL_FIELDS, type TicketDetailField,
} from './TicketDetailView.validation'

interface Props {
  ticket: Ticket & { customer_name: string | null; customer_phone: string | null; customer_email_onfile: string | null }
  events: TicketEvent[]
  escalations: TicketEscalation[]
  solutions: TicketSolution[]
  role: string
  t2Team: string | null
  userId: string
  activeAssistance: ActiveAssistanceRecord[]
  /** Active agent/team_leader profiles, for the team-leader-tier "reassign this
   *  callback" picker — empty for roles that never see that control. */
  activeAgents: { id: string; full_name: string }[]
  /**
   * Called alongside router.refresh() after every successful action — only
   * needed when this view is rendered inside a modal fed by client-fetched
   * props (T2TicketDetailModal.tsx): router.refresh() re-renders the page
   * behind the modal, but the modal's own `ticket`/`events`/etc. props are
   * local state that a route refresh alone won't update, so a stale
   * `ticket.status` would make the next action's available buttons wrong.
   * The dedicated /tickets/t2/[id] page (server-rendered `ticket` prop)
   * doesn't need this — router.refresh() alone re-renders it correctly.
   */
  onRefresh?: () => void
}

function fmt(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-white mt-0.5">{value}</dd>
    </div>
  )
}

const sectionCls = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-5'
const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'
const btnPrimary = 'px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors'
const btnSecondary = 'px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors'
const btnDanger = 'px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors'

const OUTCOMES = [
  'Solved', 'Escalated to billing', 'Escalated to Collections', 'Escalated to Retentions',
  'Escalated to NPO', 'Escalated to Logistics', 'Failed contact',
  'Escalated to Voice', 'Issue already resolved',
  'Escalated to Core', 'Escalated to TL', 'Sent to a store',
]
const OUTCOME_TEAM_MAP: Record<string, string> = {
  'Escalated to billing': 'Billing', 'Escalated to Collections': 'Collections',
  'Escalated to Retentions': 'Retentions', 'Escalated to NPO': 'NPO',
  'Escalated to Logistics': 'Logistics', 'Escalated to Voice': 'Voice', 'Escalated to Core': 'Core',
}
const TL_OUTCOME = 'Escalated to TL'
const T3_TEAMS = ['NPO', 'IP Core', 'PS Core', 'ISOC', 'RAN Configs', 'Billing', 'Retentions', 'Collections', 'Logistics', 'Voice', 'Core', 'Other T3 Team']
const PRIORITIES = ['low', 'medium', 'high', 'critical']
const SOLUTION_OUTCOMES: [string, string][] = [
  ['resolved', 'Resolved'], ['customer_to_monitor', 'Customer to Monitor'],
  ['escalated', 'Escalated'], ['unresolved', 'Unresolved'],
]
const DIAG_FIELDS: [keyof DiagnosticsInput, string][] = [
  ['rsrp', 'RSRP'], ['rsrq', 'RSRQ'], ['sinr', 'SINR'],
  ['serving_site', 'Serving Site'], ['connected_site', 'Connected Site'], ['band', 'Band'],
  ['network_technology', 'Network Technology'], ['download_speed', 'Download Speed'],
  ['upload_speed', 'Upload Speed'], ['latency', 'Latency'],
]

const EMPTY_SOLVE: SolveInput = { troubleshooting_performed: '', findings: '', solution: '', outcome: 'resolved' }
const EMPTY_ESCALATE: EscalateInput = {
  escalate_to: '', escalation_reason: '', technical_findings: '', troubleshooting_already_performed: '',
  regular_site: '', serving_site: '', station_reference_ticket: '', agent_notes: '', priority: 'medium',
}

export default function TicketDetailView({ ticket, events, escalations, solutions, role, t2Team, userId, activeAssistance, activeAgents, onRefresh }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<TicketDetailField>(TICKET_DETAIL_FIELDS)
  const [note, setNote] = useState('')

  const [editingDiag, setEditingDiag] = useState(false)
  const [diagForm, setDiagForm] = useState<DiagnosticsInput | null>(null)

  const [outcomeChoice, setOutcomeChoice] = useState('')
  const [solveForm, setSolveForm] = useState<SolveInput>(EMPTY_SOLVE)
  const [showEscalate, setShowEscalate] = useState(false)
  const [escalateForm, setEscalateForm] = useState<EscalateInput>(EMPTY_ESCALATE)
  const [respondText, setRespondText] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [showValidateWorked, setShowValidateWorked] = useState(false)
  const [validateForm, setValidateForm] = useState<SolveInput>(EMPTY_SOLVE)
  const [reviewNote, setReviewNote] = useState('')
  const [editedSolution, setEditedSolution] = useState('')
  const [showEditReview, setShowEditReview] = useState(false)
  const [reassignTo, setReassignTo] = useState('')

  const canActOnTicket = (role === 'agent' || role === 'team_leader') && ['open', 'in_progress', 'callback'].includes(ticket.status)
  const canEditDiagnostics = (role === 'agent' || role === 'team_leader' || (role === 't3' && ticket.escalation_destination === t2Team))
    && !['resolved', 'closed'].includes(ticket.status)
  const canClose = (role === 'agent' || role === 'team_leader') && ticket.status === 'resolved'
  const latestSolution = solutions[solutions.length - 1]
  const canReview = role === 'team_leader' && latestSolution && latestSolution.review_status === 'pending'
  const canReassignCallback = (role === 'team_leader' || role === 'management' || role === 'hod') && ticket.status === 'callback'

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true)
    clearAll()
    const result = await fn()
    setBusy(false)
    if (result?.error) applyActionError({ error: result.error })
    else { router.refresh(); onRefresh?.() }
  }

  function startEditDiag() {
    setDiagForm({
      project: ticket.project, root_cause: ticket.root_cause,
      rsrp: ticket.rsrp, rsrq: ticket.rsrq, sinr: ticket.sinr,
      serving_site: ticket.serving_site, connected_site: ticket.connected_site, band: ticket.band,
      network_technology: ticket.network_technology, download_speed: ticket.download_speed,
      upload_speed: ticket.upload_speed, latency: ticket.latency,
    })
    setEditingDiag(true)
  }

  async function saveDiag() {
    if (!diagForm) return
    await run(() => updateDiagnosticsAction(ticket.id, diagForm))
    setEditingDiag(false)
  }

  function handleOutcomeChange(value: string) {
    setOutcomeChoice(value)
    if (value === TL_OUTCOME) return
    const team = OUTCOME_TEAM_MAP[value]
    if (team) {
      setEscalateForm((f) => ({ ...f, escalate_to: team }))
      setShowEscalate(true)
      return
    }
    setShowEscalate(false)
    setSolveForm((f) => ({ ...f, outcome: ['Solved', 'Issue already resolved'].includes(value) ? 'resolved' : 'unresolved' }))
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    await run(async () => {
      const r = await addTicketNoteAction(ticket.id, note)
      if (!r.error) setNote('')
      return r
    })
  }

  async function submitSolve(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    const errs = validateSolve(solveForm, 'solve')
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    await run(() => solveTicketAction(ticket.id, solveForm))
  }

  function startEscalate() {
    setEscalateForm({ ...EMPTY_ESCALATE, regular_site: ticket.regular_site ?? '', serving_site: ticket.serving_site ?? '' })
    setShowEscalate(true)
  }

  async function submitEscalate(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    const errs = validateEscalate(escalateForm)
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    await run(async () => {
      const r = await escalateTicketAction(ticket.id, escalateForm)
      if (!r.error) setShowEscalate(false)
      return r
    })
  }

  async function submitReassign(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    const errs = validateReassign(reassignTo)
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    await run(async () => {
      const r = await reassignCallbackTicketAction(ticket.id, reassignTo)
      if (!r.error) setReassignTo('')
      return r
    })
  }

  async function submitAcknowledge(escId: string) {
    await run(() => acknowledgeEscalationAction(ticket.id, escId))
  }

  async function submitRespond(escId: string) {
    clearAll()
    const errs = validateRespond(respondText)
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    await run(async () => {
      const r = await respondEscalationAction(ticket.id, escId, respondText)
      if (!r.error) setRespondText('')
      return r
    })
  }

  async function submitValidateRejected(escId: string) {
    await run(async () => {
      const r = await validateEscalationAction(ticket.id, escId, { result: 'rejected', note: rejectNote || undefined })
      if (!r.error) setRejectNote('')
      return r
    })
  }

  async function submitValidateResolved(escId: string) {
    clearAll()
    const errs = validateSolve(validateForm, 'validate')
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    await run(async () => {
      const r = await validateEscalationAction(ticket.id, escId, { result: 'resolved', ...validateForm })
      if (!r.error) setShowValidateWorked(false)
      return r
    })
  }

  async function submitReview(action: 'approve' | 'edit' | 'reject') {
    clearAll()
    if (action === 'edit') {
      const errs = validateEditedSolution(editedSolution)
      if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    }
    await run(async () => {
      const r = await reviewSolutionAction(ticket.id, {
        action, edited_solution: action === 'edit' ? editedSolution : undefined, note: reviewNote || undefined,
      })
      if (!r.error) { setReviewNote(''); setEditedSolution(''); setShowEditReview(false) }
      return r
    })
  }

  return (
    <div className="max-w-4xl space-y-6">
      <FormErrorBanner message={formError} />

      <div className={sectionCls}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <StatusBadge status={ticket.status} />
            <span className="text-sm text-gray-500 dark:text-gray-400">{ticket.queue}</span>
          </div>
          <div className="flex items-center gap-3">
            {canEditDiagnostics && !editingDiag && (
              <button className={btnSecondary} onClick={startEditDiag}>Edit diagnostics</button>
            )}
          </div>
        </div>

        <div className="mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wide">Customer</dt>
          <dd className="text-sm text-gray-900 dark:text-white mt-0.5">
            {ticket.customer_name
              ? `${ticket.customer_name} — ${ticket.customer_phone}${ticket.customer_email_onfile ? ` — ${ticket.customer_email_onfile}` : ''}`
              : <span className="text-gray-400 dark:text-gray-600">No customer linked (migrated ticket)</span>}
          </dd>
        </div>

        <ActiveAssistanceBanner records={activeAssistance} excludeSourceId={ticket.id} className="mb-4" />

        {!editingDiag && (
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Issue type" value={ticket.issue_type} />
            <Field label="Root cause" value={ticket.root_cause} />
            <Field label="Channel" value={ticket.channel} />
            <Field label="Amount" value={ticket.amount != null ? `R ${Number(ticket.amount).toFixed(2)}` : null} />
            <Field label="Device" value={ticket.device} />
            <Field label="Escalation path" value={ticket.escalation_path} />
            <Field label="Project" value={ticket.project} />
            <Field label="Regular site" value={ticket.regular_site} />
            <Field label="Serving site" value={ticket.serving_site} />
            <Field label="Connected site" value={ticket.connected_site} />
            <Field label="RSRP" value={ticket.rsrp} />
            <Field label="RSRQ" value={ticket.rsrq} />
            <Field label="SINR" value={ticket.sinr} />
            <Field label="Band" value={ticket.band} />
            <Field label="Network tech" value={ticket.network_technology} />
            <Field label="Download speed" value={ticket.download_speed} />
            <Field label="Upload speed" value={ticket.upload_speed} />
            <Field label="Latency" value={ticket.latency} />
            <Field label="IMSI" value={ticket.imsi} />
            <Field label="MSISDN" value={ticket.msisdn} />
            <Field label="Customer email" value={ticket.customer_email} />
            <Field label="Sim type" value={ticket.sim_type} />
            <Field label="Swap reason" value={ticket.swap_reason} />
            <Field label="Swap requested" value={ticket.swap_requested_date} />
            <Field label="Swap processed" value={ticket.swap_processed} />
            <Field label="Station ticket number" value={ticket.station_ticket_number} />
            <Field label="Port in request" value={ticket.port_in} />
            <Field label="Customer experiencing issues" value={ticket.port_customer_experiencing_issues} />
            <Field label="Port issue type" value={ticket.port_issue_type} />
            <Field label="Inquiry type" value={ticket.port_inquiry_type} />
            <Field label="Reversal reason" value={ticket.port_reversal_reason} />
            <Field label="Donor ISP" value={ticket.donor_isp} />
            <Field label="Outcome" value={ticket.outcome} />
            <Field label="Callback scheduled" value={ticket.callback_scheduled_at} />
            <Field label="Callback notes" value={ticket.callback_notes} />
            <Field label="Escalation destination" value={ticket.escalation_destination} />
            <Field label="Created" value={fmt(ticket.created_at)} />
            <Field label="Acknowledged" value={fmt(ticket.acknowledged_at)} />
            <Field label="Resolved" value={fmt(ticket.resolved_at)} />
            <Field label="Closed" value={fmt(ticket.closed_at)} />
          </dl>
        )}

        {editingDiag && diagForm && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {DIAG_FIELDS.map(([field, label]) => (
              <div key={field}>
                <label className={labelCls}>{label}</label>
                <input className={inputCls} value={diagForm[field] ?? ''} onChange={(e) => setDiagForm((f) => f && { ...f, [field]: e.target.value })} />
              </div>
            ))}
            <div className="col-span-full flex gap-2 justify-end">
              <button className={btnSecondary} disabled={busy} onClick={() => setEditingDiag(false)}>Cancel</button>
              <button className={btnPrimary} disabled={busy} onClick={saveDiag}>Save diagnostics</button>
            </div>
          </div>
        )}

        {ticket.description && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wide mb-1">Description</dt>
            <dd className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{ticket.description}</dd>
          </div>
        )}
      </div>

      {canReassignCallback && (
        <div className={sectionCls}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Reassign callback</h3>
          <form onSubmit={submitReassign} noValidate className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <label className={labelCls}>Take over, or hand it to</label>
              <select
                id="ticket-reassign_to" className={fieldInputClass(inputCls, !!fieldErrors.reassign_to)} {...fieldA11y('ticket-reassign_to', fieldErrors.reassign_to)}
                value={reassignTo} onChange={(e) => { setReassignTo(e.target.value); clearFieldError('reassign_to') }}
              >
                <option value="">Select someone…</option>
                {activeAgents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
              <FieldError id="ticket-reassign_to" message={fieldErrors.reassign_to} />
            </div>
            <button className={btnPrimary} disabled={busy}>Reassign</button>
          </form>
        </div>
      )}

      {canActOnTicket && (
        <div className={sectionCls}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Outcome</h3>
          <div className="mb-4">
            <label className={labelCls}>What happened on this ticket?</label>
            <select className={inputCls} value={outcomeChoice} onChange={(e) => handleOutcomeChange(e.target.value)}>
              <option value="">Select an outcome…</option>
              {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Resolve it yourself</h4>
          <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">Solved it? Capture the solution below — no escalation needed.</p>
          <form onSubmit={submitSolve} noValidate className="flex flex-col gap-3 mb-5 pb-5 border-b border-gray-100 dark:border-gray-800">
            <div>
              <label className={labelCls}>Troubleshooting performed</label>
              <textarea
                id="ticket-solve_troubleshooting" className={fieldInputClass(inputCls, !!fieldErrors.solve_troubleshooting)} {...fieldA11y('ticket-solve_troubleshooting', fieldErrors.solve_troubleshooting)}
                value={solveForm.troubleshooting_performed} onChange={(e) => { setSolveForm((f) => ({ ...f, troubleshooting_performed: e.target.value })); clearFieldError('solve_troubleshooting') }}
              />
              <FieldError id="ticket-solve_troubleshooting" message={fieldErrors.solve_troubleshooting} />
            </div>
            <div>
              <label className={labelCls}>Findings</label>
              <textarea
                id="ticket-solve_findings" className={fieldInputClass(inputCls, !!fieldErrors.solve_findings)} {...fieldA11y('ticket-solve_findings', fieldErrors.solve_findings)}
                value={solveForm.findings} onChange={(e) => { setSolveForm((f) => ({ ...f, findings: e.target.value })); clearFieldError('solve_findings') }}
              />
              <FieldError id="ticket-solve_findings" message={fieldErrors.solve_findings} />
            </div>
            <div>
              <label className={labelCls}>Solution</label>
              <textarea
                id="ticket-solve_solution" className={fieldInputClass(inputCls, !!fieldErrors.solve_solution)} {...fieldA11y('ticket-solve_solution', fieldErrors.solve_solution)}
                value={solveForm.solution} onChange={(e) => { setSolveForm((f) => ({ ...f, solution: e.target.value })); clearFieldError('solve_solution') }}
              />
              <FieldError id="ticket-solve_solution" message={fieldErrors.solve_solution} />
            </div>
            <div>
              <label className={labelCls}>Outcome</label>
              <select className={inputCls} value={solveForm.outcome} onChange={(e) => setSolveForm((f) => ({ ...f, outcome: e.target.value }))}>
                {SOLUTION_OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button className={`${btnPrimary} self-end`} disabled={busy}>Mark resolved</button>
          </form>

          {!showEscalate ? (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-500">Can't solve it? Open an escalation path on this ticket.</p>
              <button className={btnSecondary} onClick={startEscalate}>Escalate Ticket</button>
            </div>
          ) : (
            <form onSubmit={submitEscalate} noValidate className="flex flex-col gap-3">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Escalation Details</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Escalate to</label>
                  <select
                    id="ticket-escalate_to" required className={fieldInputClass(inputCls, !!fieldErrors.escalate_to)} {...fieldA11y('ticket-escalate_to', fieldErrors.escalate_to)}
                    value={escalateForm.escalate_to} onChange={(e) => { setEscalateForm((f) => ({ ...f, escalate_to: e.target.value })); clearFieldError('escalate_to') }}
                  >
                    <option value="">Select…</option>
                    {T3_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <FieldError id="ticket-escalate_to" message={fieldErrors.escalate_to} />
                </div>
                <div>
                  <label className={labelCls}>Priority</label>
                  <select className={inputCls} value={escalateForm.priority} onChange={(e) => setEscalateForm((f) => ({ ...f, priority: e.target.value }))}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Escalation reason</label>
                  <textarea
                    id="ticket-escalation_reason" className={fieldInputClass(inputCls, !!fieldErrors.escalation_reason)} {...fieldA11y('ticket-escalation_reason', fieldErrors.escalation_reason)}
                    value={escalateForm.escalation_reason ?? ''} onChange={(e) => { setEscalateForm((f) => ({ ...f, escalation_reason: e.target.value })); clearFieldError('escalation_reason') }}
                  />
                  <FieldError id="ticket-escalation_reason" message={fieldErrors.escalation_reason} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Technical findings</label>
                  <textarea className={inputCls} value={escalateForm.technical_findings ?? ''} onChange={(e) => setEscalateForm((f) => ({ ...f, technical_findings: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Station reference ticket #</label>
                  <input className={inputCls} value={escalateForm.station_reference_ticket ?? ''} onChange={(e) => setEscalateForm((f) => ({ ...f, station_reference_ticket: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" className={btnSecondary} disabled={busy} onClick={() => setShowEscalate(false)}>Cancel</button>
                <button className={btnPrimary} disabled={busy}>Submit Escalation</button>
              </div>
            </form>
          )}
        </div>
      )}

      {escalations.length > 0 && (
        <div className={sectionCls}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Escalation history</h3>
          <div className="space-y-4">
            {escalations.map((e) => (
              <div key={e.id} className="border border-gray-100 dark:border-gray-800 rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="font-medium text-gray-900 dark:text-white">→ {e.escalate_to}</span>
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {e.status} · {e.priority}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{e.escalation_reason}</p>
                {e.t3_response && <Field label="T3 response" value={e.t3_response} />}
                {e.t2_validation_result && <Field label="T2 validation" value={`${e.t2_validation_result}${e.t2_validation_note ? ` — ${e.t2_validation_note}` : ''}`} />}
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-2">{fmt(e.created_at)}</p>

                {e.status === 'open' && role === 't3' && t2Team === e.escalate_to && (
                  <button className={`${btnPrimary} mt-3`} disabled={busy} onClick={() => submitAcknowledge(e.id)}>Acknowledge</button>
                )}

                {e.status === 'acknowledged' && role === 't3' && t2Team === e.escalate_to && (
                  <form onSubmit={(ev) => { ev.preventDefault(); submitRespond(e.id) }} noValidate className="mt-3 flex flex-col gap-2">
                    <textarea
                      id={`ticket-respond_text-${e.id}`} className={fieldInputClass(inputCls, !!fieldErrors.respond_text)} {...fieldA11y(`ticket-respond_text-${e.id}`, fieldErrors.respond_text)}
                      placeholder="Your findings and resolution for T2…" value={respondText} onChange={(ev) => { setRespondText(ev.target.value); clearFieldError('respond_text') }}
                    />
                    <FieldError id={`ticket-respond_text-${e.id}`} message={fieldErrors.respond_text} />
                    <button className={`${btnPrimary} self-end`} disabled={busy}>Submit Response</button>
                  </form>
                )}

                {e.status === 'responded' && (role === 'agent' || role === 'team_leader') && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <h5 className="text-xs font-medium text-gray-900 dark:text-white mb-2">T2 Validation — did this resolve the issue?</h5>
                    {!showValidateWorked ? (
                      <div className="flex flex-col gap-2">
                        <input className={inputCls} placeholder="Note if it didn't work (optional)" value={rejectNote} onChange={(ev) => setRejectNote(ev.target.value)} />
                        <div className="flex gap-2">
                          <button
                            type="button" className={btnPrimary} disabled={busy}
                            onClick={() => { setValidateForm({ ...EMPTY_SOLVE, solution: e.t3_response || '' }); setShowValidateWorked(true) }}
                          >It worked</button>
                          <button type="button" className={btnDanger} disabled={busy} onClick={() => submitValidateRejected(e.id)}>Didn't work — escalate again</button>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={(ev) => { ev.preventDefault(); submitValidateResolved(e.id) }} noValidate className="flex flex-col gap-2">
                        <textarea
                          id={`ticket-validate_troubleshooting-${e.id}`} className={fieldInputClass(inputCls, !!fieldErrors.validate_troubleshooting)} {...fieldA11y(`ticket-validate_troubleshooting-${e.id}`, fieldErrors.validate_troubleshooting)}
                          placeholder="Troubleshooting performed" value={validateForm.troubleshooting_performed} onChange={(ev) => { setValidateForm((f) => ({ ...f, troubleshooting_performed: ev.target.value })); clearFieldError('validate_troubleshooting') }}
                        />
                        <FieldError id={`ticket-validate_troubleshooting-${e.id}`} message={fieldErrors.validate_troubleshooting} />
                        <textarea
                          id={`ticket-validate_findings-${e.id}`} className={fieldInputClass(inputCls, !!fieldErrors.validate_findings)} {...fieldA11y(`ticket-validate_findings-${e.id}`, fieldErrors.validate_findings)}
                          placeholder="Findings" value={validateForm.findings} onChange={(ev) => { setValidateForm((f) => ({ ...f, findings: ev.target.value })); clearFieldError('validate_findings') }}
                        />
                        <FieldError id={`ticket-validate_findings-${e.id}`} message={fieldErrors.validate_findings} />
                        <textarea
                          id={`ticket-validate_solution-${e.id}`} className={fieldInputClass(inputCls, !!fieldErrors.validate_solution)} {...fieldA11y(`ticket-validate_solution-${e.id}`, fieldErrors.validate_solution)}
                          placeholder="Final solution" value={validateForm.solution} onChange={(ev) => { setValidateForm((f) => ({ ...f, solution: ev.target.value })); clearFieldError('validate_solution') }}
                        />
                        <FieldError id={`ticket-validate_solution-${e.id}`} message={fieldErrors.validate_solution} />
                        <div className="flex gap-2 justify-end">
                          <button type="button" className={btnSecondary} disabled={busy} onClick={() => setShowValidateWorked(false)}>Back</button>
                          <button className={btnPrimary} disabled={busy}>Confirm Resolved</button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {latestSolution && (
        <div className={sectionCls}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Submitted solution</h3>
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{latestSolution.review_status}</span>
          </div>
          <dl className="grid grid-cols-2 gap-4 mb-2">
            <Field label="Troubleshooting performed" value={latestSolution.troubleshooting_performed} />
            <Field label="Findings" value={latestSolution.findings} />
            <Field label="Solution" value={latestSolution.solution} />
            <Field label="Outcome" value={latestSolution.outcome} />
            <Field label="Submitted by" value={latestSolution.agent_name} />
            <Field label="Reviewer note" value={latestSolution.review_note} />
          </dl>

          {canReview && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Team Lead Review</h4>
              {showEditReview && (
                <>
                  <textarea
                    id="ticket-edited_solution" className={`${fieldInputClass(inputCls, !!fieldErrors.edited_solution)} mb-2`} {...fieldA11y('ticket-edited_solution', fieldErrors.edited_solution)}
                    placeholder="Provide the corrected solution text" value={editedSolution} onChange={(e) => { setEditedSolution(e.target.value); clearFieldError('edited_solution') }}
                  />
                  <FieldError id="ticket-edited_solution" message={fieldErrors.edited_solution} />
                </>
              )}
              <input className={`${inputCls} mb-2`} placeholder="Review note (optional)" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
              <div className="flex gap-2">
                <button className={btnPrimary} disabled={busy} onClick={() => submitReview('approve')}>Approve</button>
                {!showEditReview
                  ? <button className={btnSecondary} disabled={busy} onClick={() => { setEditedSolution(latestSolution.solution ?? ''); setShowEditReview(true) }}>Edit &amp; Approve</button>
                  : <button className={btnPrimary} disabled={busy} onClick={() => submitReview('edit')}>Submit Edit</button>}
                <button className={btnDanger} disabled={busy} onClick={() => submitReview('reject')}>Reject</button>
              </div>
            </div>
          )}
        </div>
      )}

      {canClose && (
        <div className={sectionCls}>
          <button className={btnPrimary} disabled={busy} onClick={() => run(() => closeTicketAction(ticket.id, 'Customer updated and ticket closed.'))}>
            Update customer &amp; close
          </button>
        </div>
      )}

      <div className={sectionCls}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Event timeline</h3>
        <ol className="space-y-3 mb-4">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="text-gray-400 dark:text-gray-600 shrink-0 w-36">{fmt(e.created_at)}</span>
              <span className="text-gray-700 dark:text-gray-300">
                <span className="font-medium">{e.user_name ?? 'System'}</span> — {e.event_type.replace(/_/g, ' ')}
                {e.note && <span className="block text-gray-500 dark:text-gray-500 mt-0.5">{e.note}</span>}
              </span>
            </li>
          ))}
          {events.length === 0 && <li className="text-gray-400 dark:text-gray-600 text-sm">No events yet.</li>}
        </ol>
        <form onSubmit={submitNote} className="flex gap-2">
          <input className={inputCls} placeholder="Add a note or investigation update…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className={btnSecondary} disabled={busy}>Add note</button>
        </form>
      </div>
    </div>
  )
}
