'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { animate } from 'animejs'
import { AlertTriangle, CheckCircle2, Loader2, Trash2, XCircle } from 'lucide-react'
import {
  SCORECARD_ITEMS, applyLegs, bandsLegend, fromDbLeg, resolveSettings, scoreScorecard,
  type ItemCode, type ItemInput, type Leg, type LegValue, type QaLegs, type RatingLabel, type SettingsRow,
} from '@/lib/qa/scorecard'
import { identifyCoachingOpportunities } from '@/lib/qa/coachingOpportunities'
import { DEPARTMENT_LABELS } from '@/lib/qa/constants'
import { DEPARTMENTS, getAgentDepartment, type Department, type DepartmentProfile } from '@/lib/departments'
import { QaCriticalFailureType, QaQueryCategory, QaReviewWithDetail } from '@/types'
import { createReviewAction, deleteReviewAction, updateReviewAction, type SaveReviewInput } from '@/app/(app)/qa-reviews/actions'
import CoachingActionsPanel from './CoachingActionsPanel'
import ScorecardRow, { type RowState } from './ScorecardRow'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'
import { validateReview } from './ReviewForm.validation'

interface AgentOption extends DepartmentProfile { id: string; full_name: string; team_leader_full_name: string | null }

interface Props {
  agents: AgentOption[]
  reviewerName: string
  settingsRows: SettingsRow[]
  /** Types with an item_code: optional reasons under a C row marked No. */
  reasonTagTypes: QaCriticalFailureType[]
  /** Types without an item_code: the coaching-flags panel. Root Cause offers these and the reason-tag types. */
  coachingFlagTypes: QaCriticalFailureType[]
  /** Query / Category options, inactive included (only the review's own retired one is still offered). */
  categories: QaQueryCategory[]
  existing?: QaReviewWithDetail
  readOnly?: boolean
  ownerCandidates: { id: string; full_name: string }[]
  canManageCoaching: boolean
  /** Existing reviews only — see qaReviewCanDelete. */
  canDelete?: boolean
}

type Fcr = 'yes' | 'no' | 'na' | null
/** `${ItemCode}:${Leg}` — a leg cell the legs selector set to N/A itself (not the reviewer). */
type CellKey = `${ItemCode}:${Leg}`

const CODES: ItemCode[] = SCORECARD_ITEMS.map((d) => d.code)
const LEGS_OPTIONS: { value: QaLegs; label: string }[] = [
  { value: 'written', label: 'Written' },
  { value: 'call', label: 'Call' },
  { value: 'both', label: 'Both' },
]
const SECTIONS = [
  { section: 'critical', title: 'Critical gate', subtitle: 'Any No = Fail (Critical), score capped' },
  { section: 'must_do', title: 'Must-do behaviours', subtitle: '35 points' },
  { section: 'quality', title: 'Quality ratings', subtitle: '65 points, 0–5 per leg' },
] as const

const BAR_COLOR_IN_PROGRESS = '#3b82f6' // blue-500
const BAR_COLOR_GOOD = '#22c55e'        // green-500
const BAR_COLOR_FAIL = '#ef4444'        // red-500
const BAR_COLOR_UNCLASSIFIED = '#9ca3af' // gray-400

const isFailRating = (r: RatingLabel) => r === 'Fail' || r === 'Fail (Critical)'
const barColor = (r: RatingLabel) => (isFailRating(r) ? BAR_COLOR_FAIL : r === '' ? BAR_COLOR_UNCLASSIFIED : BAR_COLOR_GOOD)
/** Legs the reviewer can edit. No choice yet: both stay open (validation asks for the choice). */
const activeLegsOf = (legs: QaLegs | null): Leg[] => (legs === 'written' ? ['written'] : legs === 'call' ? ['call'] : ['written', 'call'])
const blankToNull = (v: string) => (v.trim() ? v : null)
const emptyRow = (): RowState => ({ written: null, call: null, comments: '', evidence: '' })

function initialRows(existing?: QaReviewWithDetail): Record<ItemCode, RowState> {
  const rows = Object.fromEntries(CODES.map((c) => [c, emptyRow()])) as Record<ItemCode, RowState>
  for (const i of existing?.items ?? []) {
    rows[i.item_code] = {
      written: fromDbLeg(i.item_code, i.written_value), call: fromDbLeg(i.item_code, i.call_value),
      comments: i.comments ?? '', evidence: i.evidence ?? '',
    }
  }
  return rows
}

/** Drops reason tags whose item no longer has a No leg. */
function pruneTags(tags: Set<string>, rows: Record<ItemCode, RowState>, tagItem: Map<string, ItemCode>): Set<string> {
  const next = new Set([...tags].filter((id) => {
    const code = tagItem.get(id)
    return !!code && (rows[code].written === 'no' || rows[code].call === 'no')
  }))
  return next.size === tags.size ? tags : next
}

export default function ReviewForm({ agents, reviewerName, settingsRows, reasonTagTypes, coachingFlagTypes, categories, existing, readOnly, ownerCandidates, canManageCoaching, canDelete }: Props) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)

  const [agentId, setAgentId] = useState(existing?.agent_id ?? '')
  const [department, setDepartment] = useState<Department | ''>(existing?.department ?? '')
  // The department last filled in from an agent; a later agent change only overwrites a value still equal to it.
  const [autoDepartment, setAutoDepartment] = useState<Department | null>(null)
  const [legs, setLegs] = useState<QaLegs | null>(existing?.legs ?? null)
  const [interactionDate, setInteractionDate] = useState(existing?.interaction_date ?? today)
  const [reviewDate, setReviewDate] = useState(existing?.review_date ?? today)
  const [categoryId, setCategoryId] = useState(existing?.category_id ?? '')
  const [interactionType, setInteractionType] = useState(existing?.interaction_type ?? '')
  const [ticketReference, setTicketReference] = useState(existing?.ticket_reference ?? '')
  const [callReference, setCallReference] = useState(existing?.call_reference ?? '')
  const [customerReference, setCustomerReference] = useState(existing?.customer_reference ?? '')
  const [secondaryAgentName, setSecondaryAgentName] = useState(existing?.secondary_agent_name ?? '')
  const [overallComments, setOverallComments] = useState(existing?.overall_comments ?? '')
  const [fcr, setFcr] = useState<Fcr>(existing?.fcr ?? null)
  const [gapIdentified, setGapIdentified] = useState(existing?.gap_identified ?? '')
  const [solution, setSolution] = useState(existing?.solution ?? '')

  const [rows, setRows] = useState(() => initialRows(existing))
  // Starts empty on edit, so nothing saved is ever cleared by the legs selector.
  const [autoNa, setAutoNa] = useState<Set<CellKey>>(() => new Set())

  // Reason tag type -> its item, including saved tags whose type has since been deactivated.
  const tagItem = useMemo(() => {
    const m = new Map<string, ItemCode>()
    for (const cf of existing?.criticalFailures ?? []) {
      if (cf.critical_failure_type?.item_code) m.set(cf.critical_failure_type_id, cf.critical_failure_type.item_code)
    }
    for (const t of reasonTagTypes) if (t.item_code) m.set(t.id, t.item_code)
    return m
  }, [existing, reasonTagTypes])

  const [reasonTags, setReasonTags] = useState<Set<string>>(
    () => new Set((existing?.criticalFailures ?? []).filter((cf) => cf.critical_failure_type?.item_code).map((cf) => cf.critical_failure_type_id)),
  )
  const [flags, setFlags] = useState<Record<string, { checked: boolean; notes: string }>>(() => {
    const initial: Record<string, { checked: boolean; notes: string }> = {}
    for (const t of coachingFlagTypes) initial[t.id] = { checked: false, notes: '' }
    for (const cf of existing?.criticalFailures ?? []) {
      if (!cf.critical_failure_type?.item_code) initial[cf.critical_failure_type_id] = { checked: true, notes: cf.notes ?? '' }
    }
    return initial
  })

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Dynamic keys (per item leg / coaching flag), so no fixed field list: server errors carry no field and go to the banner.
  const { fieldErrors, formError, setFieldErrors, clearFieldError, setFormError, clearAll, applyActionError } = useFormErrors<string>([])
  const progressBarRef = useRef<HTMLDivElement>(null)

  const selectedAgent = agents.find((a) => a.id === agentId)
  const categoryOptions = categories.filter((c) => c.department === department && (c.is_active || c.id === existing?.category_id))
  // The old single Root Cause dropdown was replaced by the Root Causes checklist
  // (formerly Coaching Flags). Reviews saved before that keep their value as
  // read-only history — it may be either kind of critical-failure type.
  const legacyRootCause = existing?.root_cause_type_id
    ? [...coachingFlagTypes, ...reasonTagTypes].find((t) => t.id === existing.root_cause_type_id)?.name ?? null
    : null
  const activeLegs = activeLegsOf(legs)

  function handleAgentChange(nextId: string) {
    setAgentId(nextId)
    clearFieldError('agent')
    const agent = agents.find((a) => a.id === nextId)
    if (!agent) return
    const auto = getAgentDepartment(agent)
    if (department === '' || department === autoDepartment) {
      handleDepartmentChange(auto)
    }
    setAutoDepartment(auto)
  }

  function handleDepartmentChange(next: Department | '') {
    setDepartment(next)
    clearFieldError('department')
    // Categories are per department, so a category from the old one no longer applies.
    if (categories.find((c) => c.id === categoryId)?.department !== next) setCategoryId('')
  }

  function handleLegsChange(next: QaLegs) {
    if (next === legs) return
    const nextActive = activeLegsOf(next)
    const dropped = (['written', 'call'] as const).filter((l) => !nextActive.includes(l))
    const droppedHasEntries = CODES.some((c) => dropped.some((l) => rows[c][l] !== null && !autoNa.has(`${c}:${l}`)))
    if (droppedHasEntries) {
      const which = dropped.map((l) => (l === 'written' ? 'Written' : 'Call')).join(' and ')
      if (!window.confirm(`Switching legs sets every ${which} answer to N/A, replacing what you've entered on that leg. Continue?`)) return
    }

    const nextRows = { ...rows }
    const nextAutoNa = new Set(autoNa)
    for (const c of CODES) {
      const row = { ...rows[c] }
      // A leg coming back into use: clear only the N/As this selector set itself.
      for (const l of nextActive) {
        if (nextAutoNa.has(`${c}:${l}`)) { row[l] = null; nextAutoNa.delete(`${c}:${l}`) }
      }
      // A leg going out of use: force it to N/A (a reviewer's own N/A stays theirs).
      for (const l of dropped) {
        if (row[l] !== 'na') { row[l] = 'na'; nextAutoNa.add(`${c}:${l}`) }
        clearFieldError(`item_${c}_${l}`)
      }
      nextRows[c] = row
    }
    setLegs(next)
    setRows(nextRows)
    setAutoNa(nextAutoNa)
    setReasonTags((prev) => pruneTags(prev, nextRows, tagItem))
    clearFieldError('legs')
  }

  function handleCellChange(code: ItemCode, leg: Leg, value: LegValue) {
    const nextRows = { ...rows, [code]: { ...rows[code], [leg]: value } }
    setRows(nextRows)
    setAutoNa((prev) => {
      if (!prev.has(`${code}:${leg}`)) return prev
      const next = new Set(prev)
      next.delete(`${code}:${leg}`)
      return next
    })
    setReasonTags((prev) => pruneTags(prev, nextRows, tagItem))
    clearFieldError(`item_${code}_${leg}`)
  }

  function handleTextChange(code: ItemCode, field: 'comments' | 'evidence', text: string) {
    setRows((prev) => ({ ...prev, [code]: { ...prev[code], [field]: text } }))
  }

  function toggleTag(typeId: string, checked: boolean) {
    setReasonTags((prev) => {
      const next = new Set(prev)
      if (checked) next.add(typeId)
      else next.delete(typeId)
      return next
    })
  }

  // Scoring input: what the server will score (unused leg forced to N/A).
  const items: ItemInput[] = useMemo(
    () => applyLegs(CODES.map((c) => ({ code: c, written: rows[c].written, call: rows[c].call })), legs ?? 'both'),
    [rows, legs],
  )
  const settings = useMemo(() => resolveSettings(settingsRows, interactionDate), [settingsRows, interactionDate])
  const result = useMemo(() => (settings ? scoreScorecard(items, settings) : null), [items, settings])
  const opportunities = useMemo(
    () => identifyCoachingOpportunities({
      items,
      coachingFlags: coachingFlagTypes.filter((t) => flags[t.id]?.checked).map((t) => ({ name: t.name, requiresCoaching: t.requires_coaching })),
    }),
    [items, coachingFlagTypes, flags],
  )

  const final = result?.final ?? null
  const rating: RatingLabel = result?.rating ?? ''

  useEffect(() => {
    const node = progressBarRef.current
    if (!node) return
    const width = `${final ?? 0}%`
    const finalColor = barColor(rating)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion) {
      node.style.width = width
      node.style.backgroundColor = finalColor
      return
    }

    node.style.backgroundColor = BAR_COLOR_IN_PROGRESS
    animate(node, {
      width: [`${node.style.width || '0%'}`, width],
      duration: 400,
      ease: 'outQuad',
      onComplete: () => { node.style.backgroundColor = finalColor },
    })
  }, [final, rating])

  async function handleSave() {
    clearAll()
    const errs = validateReview({ agentId, interactionDate, legs, department: department || null, items, coachingFlags: flags })
    const keys = Object.keys(errs)
    if (keys.length > 0) {
      setFieldErrors(errs)
      // The form is long and Submit sits at the bottom, so say how many fields need attention and bring the first one into view.
      setFormError(`${keys.length} field${keys.length === 1 ? '' : 's'} need${keys.length === 1 ? 's' : ''} attention — see the highlighted fields above.`)
      requestAnimationFrame(() => document.getElementById(`review-${keys[0]}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }))
      return
    }

    setSaving(true)
    const payload: SaveReviewInput = {
      agentId, legs: legs!, department: department as Department,
      interactionDate, reviewDate,
      categoryId: categoryId || null, interactionType: blankToNull(interactionType), ticketReference: blankToNull(ticketReference),
      callReference: blankToNull(callReference), customerReference: blankToNull(customerReference),
      secondaryAgentName: blankToNull(secondaryAgentName), overallComments: blankToNull(overallComments),
      items: items.map((i) => ({ code: i.code, written: i.written, call: i.call, comments: blankToNull(rows[i.code].comments), evidence: blankToNull(rows[i.code].evidence) })),
      reasonTags: [...reasonTags].map((typeId) => ({ typeId })),
      coachingFlags: Object.entries(flags).filter(([, f]) => f.checked).map(([typeId, f]) => ({ typeId, notes: f.notes })),
      fcr, rootCauseTypeId: existing?.root_cause_type_id ?? null,
      gapIdentified: blankToNull(gapIdentified), solution: blankToNull(solution),
    }

    const res = existing ? await updateReviewAction({ ...payload, id: existing.id }) : await createReviewAction(payload)

    setSaving(false)
    if ('error' in res && res.error) { applyActionError(res); return }
    router.push('/qa-reviews')
    router.refresh()
  }

  async function handleDelete() {
    if (!existing) return
    if (!confirm('Delete this QA review? Its scores, critical failures, audit log and coaching actions are removed too. This cannot be undone.')) return
    clearAll()
    setDeleting(true)
    const res = await deleteReviewAction(existing.id)
    setDeleting(false)
    if (res.error) { applyActionError(res); return }
    router.push('/qa-reviews')
    router.refresh()
  }

  const inputCls = 'w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark] disabled:bg-gray-50 dark:disabled:bg-gray-800/50 disabled:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none'
  const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1'
  const segCls = (selected: boolean) =>
    `px-3 h-9 rounded-lg text-sm font-semibold border transition-colors disabled:cursor-not-allowed ${
      selected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
    }`
  const textField = (label: string, value: string, set: (v: string) => void) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input type="text" value={value} onChange={(e) => set(e.target.value)} className={inputCls} disabled={readOnly} />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div>
          <label className={labelCls}>Reviewer / QA</label>
          <p className="text-sm text-gray-900 dark:text-white">{reviewerName}</p>
          {agentId && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Team Leader: {selectedAgent?.team_leader_full_name ?? '—'}</p>
          )}
        </div>
        <div>
          <label className={labelCls}>Date Reviewed</label>
          <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} className={inputCls} disabled={readOnly} />
        </div>
        <div>
          <label className={labelCls}>Agent</label>
          {readOnly ? (
            <p className="text-sm text-gray-900 dark:text-white">{selectedAgent?.full_name ?? '—'}</p>
          ) : (
            <>
              <select
                id="review-agent" value={agentId} disabled={!!existing || readOnly} onChange={(e) => handleAgentChange(e.target.value)}
                className={fieldInputClass(inputCls, !!fieldErrors.agent)} {...fieldA11y('review-agent', fieldErrors.agent)}
              >
                <option value="">Select agent...</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
              <FieldError id="review-agent" message={fieldErrors.agent} />
            </>
          )}
        </div>
        <div>
          <label className={labelCls}>Department</label>
          <select
            id="review-department" value={department} disabled={readOnly}
            onChange={(e) => handleDepartmentChange(e.target.value as Department | '')}
            className={fieldInputClass(inputCls, !!fieldErrors.department)} {...fieldA11y('review-department', fieldErrors.department)}
          >
            <option value="">Select department...</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
          </select>
          <FieldError id="review-department" message={fieldErrors.department} />
        </div>
        <div>
          <label className={labelCls}>Interaction Date</label>
          <input
            id="review-interaction-date" type="date" value={interactionDate} disabled={readOnly}
            onChange={(e) => { setInteractionDate(e.target.value); clearFieldError('interactionDate') }}
            className={fieldInputClass(inputCls, !!fieldErrors.interactionDate)} {...fieldA11y('review-interaction-date', fieldErrors.interactionDate)}
          />
          <FieldError id="review-interaction-date" message={fieldErrors.interactionDate} />
        </div>
        {textField('Ticket ID / Post Link', ticketReference, setTicketReference)}
        {textField('Call ID / Reference', callReference, setCallReference)}
        <div>
          <label className={labelCls} htmlFor="review-category">Query / Category</label>
          <select id="review-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls} disabled={readOnly || !department}>
            <option value="">{department ? 'Select category...' : 'Pick a department first'}</option>
            {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.is_active ? c.name : `${c.name} (retired)`}</option>)}
          </select>
        </div>
        {textField('Category detail (optional)', interactionType, setInteractionType)}
        {textField('Customer reference', customerReference, setCustomerReference)}
        {textField('Call agent (if different)', secondaryAgentName, setSecondaryAgentName)}
        <div className="sm:col-span-2">
          <label className={labelCls}>Legs on this case</label>
          <div id="review-legs" role="group" aria-label="Legs on this case" {...fieldA11y('review-legs', fieldErrors.legs)} className="flex flex-wrap gap-1.5">
            {LEGS_OPTIONS.map((o) => (
              <button key={o.value} type="button" aria-pressed={legs === o.value} disabled={readOnly} onClick={() => handleLegsChange(o.value)} className={segCls(legs === o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          <FieldError id="review-legs" message={fieldErrors.legs} />
        </div>
      </div>

      {/* Live score summary */}
      <div className={`p-4 rounded-xl shadow-sm border ${isFailRating(rating) ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'}`}>
        <div className="flex items-center gap-3">
          {isFailRating(rating) ? (
            <XCircle className="w-8 h-8 text-red-600 dark:text-red-400 shrink-0" />
          ) : rating ? (
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-8 h-8 text-gray-300 dark:text-gray-600 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              QA Score: {final ?? '—'}/100{rating && ` — ${rating}`}
              {result && result.raw !== null && result.final !== result.raw && (
                <span className="text-gray-500 dark:text-gray-400 font-normal"> (capped from {result.raw})</span>
              )}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">out of {result?.used ?? 0} points scored</p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
              <div ref={progressBarRef} className="h-full rounded-full" style={{ width: '0%', backgroundColor: BAR_COLOR_IN_PROGRESS }} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              {settings ? bandsLegend(settings) : 'No QA settings apply to this interaction date.'}
            </p>
            {result?.criticalFail && (
              <p className="text-sm font-semibold text-red-600 dark:text-red-400 mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> CRITICAL QA FAILURE
              </p>
            )}
            {/* Same rule CoachingActionsPanel applies once saved (lib/qa/coachingOpportunities.ts), shown before saving. */}
            {opportunities.length > 0 && (
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> <span>Coaching session will be suggested</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* C, B and Q sections */}
      {SECTIONS.map((s) => (
        <div key={s.section} className="space-y-3">
          <div className="flex items-baseline gap-2 px-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{s.title}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">{s.subtitle}</span>
          </div>
          {SCORECARD_ITEMS.filter((d) => d.section === s.section).map((def) => (
            <ScorecardRow
              key={def.code} def={def} row={rows[def.code]} activeLegs={activeLegs} readOnly={readOnly}
              errors={{ written: fieldErrors[`item_${def.code}_written`], call: fieldErrors[`item_${def.code}_call`] }}
              onLegChange={(leg, value) => handleCellChange(def.code, leg, value)}
              onTextChange={(field, text) => handleTextChange(def.code, field, text)}
              reasonTagTypes={reasonTagTypes.filter((t) => t.item_code === def.code)}
              selectedTags={reasonTags} onToggleTag={toggleTag}
              inputCls={inputCls} labelCls={labelCls}
            />
          ))}
        </div>
      ))}

      {/* Root causes (coaching-only failure types, formerly "Coaching Flags") */}
      <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Root Causes</span>
        {coachingFlagTypes.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">No root causes configured.</p>}
        {coachingFlagTypes.map((t) => {
          const f = flags[t.id] ?? { checked: false, notes: '' }
          return (
            <div key={t.id} className="border-t border-gray-100 dark:border-gray-800 pt-3 first:border-t-0 first:pt-0">
              <label className="flex items-start gap-2 text-sm text-gray-900 dark:text-white">
                <input
                  type="checkbox" disabled={readOnly} checked={f.checked} className="mt-0.5"
                  onChange={(e) => { setFlags((prev) => ({ ...prev, [t.id]: { ...f, checked: e.target.checked } })); if (!e.target.checked) clearFieldError(`flag_notes_${t.id}`) }}
                />
                <span>
                  <span className="font-medium">{t.name}</span>
                  {t.description && <span className="block text-xs text-gray-500 dark:text-gray-400">{t.description}</span>}
                </span>
              </label>
              {f.checked && (
                <div className="mt-2 ml-6">
                  <label className={labelCls}>Notes (required)</label>
                  <input
                    id={`review-flag_notes_${t.id}`} type="text" value={f.notes} disabled={readOnly}
                    onChange={(e) => { setFlags((prev) => ({ ...prev, [t.id]: { ...f, notes: e.target.value } })); clearFieldError(`flag_notes_${t.id}`) }}
                    className={fieldInputClass(inputCls, !!fieldErrors[`flag_notes_${t.id}`])} {...fieldA11y(`review-flag_notes_${t.id}`, fieldErrors[`flag_notes_${t.id}`])}
                  />
                  <FieldError id={`review-flag_notes_${t.id}`} message={fieldErrors[`flag_notes_${t.id}`]} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Audit log block (maps to the Week 4 Auditing Sheet) */}
      <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Audit Log</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Score</label>
            <p className="text-sm text-gray-900 dark:text-white" data-testid="audit-score">{final ?? '—'}</p>
          </div>
          <div>
            <label className={labelCls}>Closing Line</label>
            <p className="text-sm text-gray-900 dark:text-white" data-testid="audit-closing-line">{result?.closingLine ?? '—'}</p>
          </div>
          <div>
            <label className={labelCls}>FCR</label>
            <div role="group" aria-label="FCR" className="flex flex-wrap gap-1.5">
              {([['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={fcr === value} disabled={readOnly} onClick={() => setFcr(fcr === value ? null : value)} className={segCls(fcr === value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {legacyRootCause && (
            <div>
              <label className={labelCls}>Root Cause (legacy)</label>
              <p className="text-sm text-gray-900 dark:text-white" data-testid="legacy-root-cause">{legacyRootCause}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="review-gap">Gap Identified</label>
            <textarea id="review-gap" rows={2} value={gapIdentified} onChange={(e) => setGapIdentified(e.target.value)} className={`${inputCls} resize-none`} disabled={readOnly} />
          </div>
          <div>
            <label className={labelCls} htmlFor="review-solution">Solution</label>
            <textarea id="review-solution" rows={2} value={solution} onChange={(e) => setSolution(e.target.value)} className={`${inputCls} resize-none`} disabled={readOnly} />
          </div>
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <label className={labelCls}>Overall comments</label>
        <textarea rows={3} value={overallComments} onChange={(e) => setOverallComments(e.target.value)} className={`${inputCls} resize-none`} disabled={readOnly} />
      </div>

      {existing && <CoachingActionsPanel review={existing} ownerCandidates={ownerCandidates} canManage={canManageCoaching} />}

      <FormErrorBanner message={formError} />

      {(!readOnly || (existing && canDelete)) && (
        <div className="flex justify-end gap-3">
          {existing && canDelete && (
            <button type="button" onClick={handleDelete} disabled={deleting || saving} className="mr-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-60 transition-colors">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          {!readOnly && (
            <>
              <button type="button" onClick={() => router.push('/qa-reviews')} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving || deleting} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : 'Submit QA'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
