'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Loader2, Plus } from 'lucide-react'
import { animate } from 'animejs'
import Modal from '@/components/ui/Modal'
import { cardCls, mutedTextCls, sectionTitleCls, tableHeadCls } from '@/components/reports/theme'
import {
  BLOCK_STATUS_LABELS, CATEGORY_LABELS, PLANNER_CATEGORIES, SHIFT_TEMPLATE_BLOCKS, blocksForTemplate,
} from '@/lib/leadops/constants'
import {
  blockMinutes, effectiveActivity, effectiveCategory, effectiveMinutes, formatDuration, summariseDay,
} from '@/lib/leadops/plannerMath'
import {
  MAX_UNPLANNED, PLANNER_MESSAGES, validateBlockInput, validatePlannerDay, validateUnplannedInput,
  type PlannerBlockInput, type PlannerDayInput, type StoredBlockStatus,
} from '@/lib/leadops/plannerLimits'
import { templateIdForResolvedShift } from '@/lib/leadops/rosterShiftMapping'
import { draftKey } from '@/lib/leadops/activityDrafts'
import type { PlannerWindow } from '@/lib/leadops/periods'
import { plannerDayFor, useLeadOpsData } from '../LeadOpsDataProvider'
import {
  BLOCK_STATUS_CLS, BLOCK_STATUS_ICON, CATEGORY_BAR_CLS, CATEGORY_CHIP_CLS,
  badgeCls, btnOutline, btnPrimary, btnSecondary, inputCls, labelCls,
} from '../statusStyles'
import { useActivityDraft } from './useActivityDraft'
import ActivityDraftNotice from './ActivityDraftNotice'
import type { BlockStatus, PlannerBlockLog, PlannerCategory, PlannerUnplannedEntry, ShiftTemplateBlock } from '@/lib/leadops/types'

interface Props {
  tlId: string
  tlName: string
  /** The team leader entering their own day. Everyone else sees the day read-only. */
  canEdit: boolean
}

const STATUSES: BlockStatus[] = ['planned', 'completed', 'moved', 'not_completed']

/** A block only carries a reportable activity/category once it counts toward the day — see effectiveActivity/effectiveCategory. */
function isReportable(status: BlockStatus): boolean {
  return status === 'completed' || status === 'moved'
}

interface BlockDraft {
  block: ShiftTemplateBlock
  status: 'moved' | 'not_completed'
  actualMinutes: number
  category: PlannerCategory
  activity: string
  reason: string
}

interface UnplannedDraft {
  category: PlannerCategory
  minutes: number
  reason: string
  displacedBlockId: string
}

/** What is sent to the server (and compared with the stored day to know whether anything is unsaved). Blocks are sorted so the comparison is stable. */
function toInput(logs: PlannerBlockLog[], unplanned: PlannerUnplannedEntry[]): PlannerDayInput {
  return {
    blocks: logs
      .filter((l) => l.status !== 'planned')
      .map((l): PlannerBlockInput => ({
        template_block_id: l.template_block_id,
        status: l.status as StoredBlockStatus,
        actual_minutes: l.actual_minutes,
        actual_category: l.actual_category,
        actual_activity: l.actual_activity?.trim() ? l.actual_activity.trim() : null,
        reason: l.reason?.trim() ? l.reason.trim() : null,
      }))
      .sort((a, b) => a.template_block_id.localeCompare(b.template_block_id)),
    unplanned: unplanned.map((u) => ({
      category: u.category, minutes: u.minutes, reason: u.reason.trim(), displaced_block_id: u.displaced_block_id || null,
    })),
  }
}

/** The rows a draft stands for, rebuilt the way the stored rows are shaped. */
function logsFromInput(blocks: PlannerBlockInput[], tlId: string, date: string): PlannerBlockLog[] {
  return blocks.map((b) => ({
    id: `log-${tlId}-${date}-${b.template_block_id}`,
    tl_id: tlId,
    date,
    template_block_id: b.template_block_id,
    status: b.status,
    actual_minutes: b.actual_minutes,
    actual_category: b.actual_category,
    actual_activity: b.actual_activity,
    reason: b.reason,
    updated_at: '',
  }))
}

function unplannedFromInput(entries: PlannerDayInput['unplanned'], tlId: string, date: string): PlannerUnplannedEntry[] {
  return entries.map((u, i) => ({
    id: `unp-${tlId}-${date}-${i}-${u.minutes}`,
    tl_id: tlId, date, category: u.category, minutes: u.minutes, reason: u.reason,
    displaced_block_id: u.displaced_block_id, created_at: '',
  }))
}

/** One line per entry, for a draft that can no longer be saved. */
function summariseInput(day: PlannerDayInput): string[] {
  const blocks = day.blocks.map((b) => {
    const planned = SHIFT_TEMPLATE_BLOCKS.find((t) => t.id === b.template_block_id)
    const label = planned ? `${planned.start_time.slice(0, 5)}–${planned.end_time.slice(0, 5)} ${planned.activity}` : b.template_block_id
    const detail = b.status === 'not_completed' ? 'not completed' : `${b.status} · ${b.actual_minutes} min · ${b.actual_category}`
    return `${label}: ${detail}${b.reason ? ` — ${b.reason}` : ''}`
  })
  const extra = day.unplanned.map((u) => `Unplanned: ${u.category} · ${u.minutes} min — ${u.reason}`)
  return [...blocks, ...extra]
}

/** Whether every block a draft names — its block rows and any block an unplanned entry displaced — is in `blockIds`. */
function draftFitsBlocks(day: PlannerDayInput, blockIds: string[]): boolean {
  const named = [
    ...day.blocks.map((b) => b.template_block_id),
    ...day.unplanned.map((u) => u.displaced_block_id).filter((id): id is string => !!id),
  ]
  return named.every((id) => blockIds.includes(id))
}

function draftToInput(d: BlockDraft): PlannerBlockInput {
  const moved = d.status === 'moved'
  return {
    template_block_id: d.block.id,
    status: d.status,
    actual_minutes: moved ? d.actualMinutes : null,
    actual_category: moved ? d.category : null,
    actual_activity: moved && d.activity.trim() ? d.activity.trim() : null,
    reason: d.reason.trim() ? d.reason.trim() : null,
  }
}

/**
 * Time & Motion actuals — Data Entry's capture surface for the planner. The day is edited LOCALLY and sent
 * as one unit with "Save day" (spec: docs/superpowers/specs/2026-10-09-leadops-time-motion-design.md);
 * the HOD's Planner tab reads the same stored data read-only.
 */
export default function TimeMotionSection({ tlId, tlName, canEdit }: Props) {
  const {
    selectedDate, plannerDays, plannerRevision, plannerRosterMismatch, plannerWindowFor, plannerWindowNow, savePlannerDay,
    reloadPlannerDay, peekPlannerRevision, resolvedShift, resolvedShiftLoading, resolvedShiftError,
  } = useLeadOpsData()
  const stored = plannerDayFor(plannerDays, tlId, selectedDate)
  // The revision THIS screen's rows were loaded at — captured once at mount (the section is remounted per team leader
  // and date, and on Reload latest) and moved forward only by a save this screen made and the server confirmed. Never
  // the provider's live revision: a refetch that lands under a mounted screen must not let its older rows be saved
  // over a newer day without the conflict check (spec section 3). Only read and written in event handlers.
  const revisionRef = useRef(plannerRevision)
  // Set when a send found the window closed at that very moment (the provider's clock may not have ticked yet).
  const [closedAtSend, setClosedAtSend] = useState<PlannerWindow | null>(null)
  const windowState = closedAtSend ?? plannerWindowFor(selectedDate)

  // The roster's template for this day. While the shift is still being read, no template applies — never the
  // previous date's (DataEntryTab does not mount this screen until it resolves; this is the second guard).
  const templateId = resolvedShiftLoading ? null : templateIdForResolvedShift(resolvedShift)
  const blocks = useMemo(() => (templateId ? blocksForTemplate(templateId) : []), [templateId])
  const blockIds = useMemo(() => blocks.map((b) => b.id), [blocks])

  // A device draft of the day being typed (lib/leadops/activityDrafts.ts). Read once at mount: this component is
  // remounted per team leader and date. It is read for any editor — even past the window, so unsent figures are
  // never lost silently — but only an editable day can be written or sent.
  const storedInput = useMemo(() => (plannerRevision > 0 ? toInput(stored.logs, stored.unplanned) : null), [plannerRevision, stored.logs, stored.unplanned])
  const drafts = useActivityDraft<PlannerDayInput>(draftKey('planner', tlId, selectedDate), canEdit, storedInput)
  // A draft that names a block outside today's template (typed before the roster changed shift, or while it could
  // not be read) could never be saved: it is shown read-only with Discard and is never applied or offered as Use them.
  const deviceDraft = drafts.restored ?? drafts.pending
  const draftForOtherShift = deviceDraft !== null && !draftFitsBlocks(deviceDraft, blockIds)
  const editableDay = canEdit && windowState.editable && !plannerRosterMismatch && !draftForOtherShift
  const startFrom = editableDay && drafts.restored ? drafts.restored : null
  const [logs, setLogs] = useState<PlannerBlockLog[]>(() => (startFrom ? logsFromInput(startFrom.blocks, tlId, selectedDate) : stored.logs))
  const [unplanned, setUnplanned] = useState<PlannerUnplannedEntry[]>(() => (startFrom ? unplannedFromInput(startFrom.unplanned, tlId, selectedDate) : stored.unplanned))
  const [unsent, setUnsent] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [baseline, setBaseline] = useState(() => JSON.stringify(toInput(stored.logs, stored.unplanned)))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const sendingRef = useRef(false)
  // Monotonic, never reused: local ids cannot collide with each other or with the server's uuids. Only touched in event handlers.
  const unplannedSeq = useRef(stored.unplanned.length)
  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null)
  const [unplannedDraft, setUnplannedDraft] = useState<UnplannedDraft | null>(null)
  const [showReasons, setShowReasons] = useState(false)

  // After a roster change the saved blocks belong to another template: label them from the code's templates.
  const shownBlocks = useMemo(
    () => (plannerRosterMismatch ? SHIFT_TEMPLATE_BLOCKS.filter((b) => logs.some((l) => l.template_block_id === b.id)) : blocks),
    [plannerRosterMismatch, blocks, logs],
  )
  const summary = useMemo(() => summariseDay(shownBlocks, logs, unplanned), [shownBlocks, logs, unplanned])
  const input = useMemo(() => toInput(logs, unplanned), [logs, unplanned])
  const dirty = JSON.stringify(input) !== baseline
  const fieldsLocked = !editableDay || saving || !!drafts.pending
  const { persist: persistDraft } = drafts

  // Autosave: keep what is on screen as a draft, but only for an editable day that has actually been changed
  // (an untouched day must not leave a draft behind, and a day past its window is never written to).
  useEffect(() => {
    if (editableDay && dirty && !drafts.pending) persistDraft(input)
  }, [input, dirty, editableDay, drafts.pending, persistDraft])
  const noShift = !resolvedShiftLoading && !resolvedShiftError && templateId === null && !plannerRosterMismatch

  function logFor(blockId: string): PlannerBlockLog | undefined {
    return logs.find((l) => l.template_block_id === blockId)
  }

  /** Merge a patch into a block's row, or remove the row (back to planned) with `null`. */
  function setBlock(block: ShiftTemplateBlock, patch: Partial<PlannerBlockLog> | null) {
    setSaved(false)
    setSaveError(null)
    setLogs((prev) => {
      const existing = prev.find((l) => l.template_block_id === block.id)
      const rest = prev.filter((l) => l.template_block_id !== block.id)
      if (patch === null) return rest
      return [...rest, {
        id: `log-${tlId}-${selectedDate}-${block.id}`,
        tl_id: tlId,
        date: selectedDate,
        template_block_id: block.id,
        status: 'completed',
        actual_minutes: null,
        actual_category: null,
        actual_activity: null,
        reason: null,
        updated_at: '',
        ...existing,
        ...patch,
      }]
    })
  }

  function updateBlockField(block: ShiftTemplateBlock, field: 'actual_activity' | 'actual_category' | 'actual_minutes', value: string) {
    if (field === 'actual_minutes') {
      const n = Number(value)
      setBlock(block, { actual_minutes: value.trim() !== '' && Number.isInteger(n) ? n : null })
      return
    }
    setBlock(block, { [field]: value === '' ? null : value } as Partial<PlannerBlockLog>)
  }

  function handleStatusChange(block: ShiftTemplateBlock, status: BlockStatus) {
    const existing = logFor(block.id)
    if (status === 'planned') { setBlock(block, null); return }
    if (status === 'completed') {
      setBlock(block, {
        status: 'completed',
        actual_minutes: existing && existing.status !== 'not_completed' && existing.actual_minutes ? existing.actual_minutes : blockMinutes(block),
        actual_category: existing?.actual_category ?? block.category,
      })
      return
    }
    setBlockDraft({
      block,
      status,
      actualMinutes: existing?.actual_minutes ?? blockMinutes(block),
      category: existing?.actual_category ?? block.category,
      activity: existing?.actual_activity ?? '',
      reason: existing?.reason ?? '',
    })
  }

  const blockDraftError = blockDraft ? validateBlockInput(draftToInput(blockDraft)) : null

  function saveBlockDraft() {
    if (!blockDraft || blockDraftError) return
    const { block, status, actualMinutes, category, activity, reason } = blockDraft
    setBlock(block, status === 'moved'
      ? { status, actual_minutes: actualMinutes, actual_category: category, actual_activity: activity.trim() || null, reason: reason.trim() }
      : { status, actual_minutes: null, actual_category: null, actual_activity: null, reason: reason.trim() })
    setBlockDraft(null)
  }

  const unplannedDraftError = unplannedDraft
    ? validateUnplannedInput({
        category: unplannedDraft.category, minutes: unplannedDraft.minutes, reason: unplannedDraft.reason,
        displaced_block_id: unplannedDraft.displacedBlockId || null,
      }, blockIds)
    : null

  // The same cap the server enforces (MAX_UNPLANNED), refused before the entry is typed rather than at Save.
  function openUnplannedDraft() {
    if (unplanned.length >= MAX_UNPLANNED) { setSaveError(PLANNER_MESSAGES.tooManyUnplanned); return }
    setUnplannedDraft({ category: 'operations', minutes: 30, reason: '', displacedBlockId: '' })
  }

  function saveUnplannedDraft() {
    if (!unplannedDraft || unplannedDraftError) return
    if (unplanned.length >= MAX_UNPLANNED) { setUnplannedDraft(null); setSaveError(PLANNER_MESSAGES.tooManyUnplanned); return }
    setSaved(false)
    setSaveError(null)
    const id = `unp-${tlId}-${selectedDate}-n${unplannedSeq.current++}`
    setUnplanned((prev) => [...prev, {
      id,
      tl_id: tlId, date: selectedDate,
      category: unplannedDraft.category, minutes: unplannedDraft.minutes, reason: unplannedDraft.reason.trim(),
      displaced_block_id: unplannedDraft.displacedBlockId || null, created_at: '',
    }])
    setUnplannedDraft(null)
  }

  function removeUnplanned(id: string) {
    setSaved(false)
    setSaveError(null)
    setUnplanned((prev) => prev.filter((e) => e.id !== id))
  }

  /**
   * The editing window at this very moment, from the real clock (not the clock the screen was rendered with: a tab
   * can sit past 12:00 the next day before Retry, the `online` resend or Replace fires). A closed window turns the
   * screen read-only — the unsent day is shown with Discard — and nothing is sent.
   */
  function windowOpenNow(): boolean {
    const now = plannerWindowNow(selectedDate)
    if (now.editable) return true
    setClosedAtSend(now)
    return false
  }

  async function send(expectedRevision: number): Promise<boolean> {
    // A day past its window (or otherwise not editable) is never sent, however this was triggered.
    if (!editableDay || sendingRef.current || !windowOpenNow()) return false
    sendingRef.current = true
    setSaving(true)
    return sendLocked(expectedRevision)
  }

  /** The body of a send. The caller has already taken the in-flight guard (and set `saving`, which locks the fields). */
  async function sendLocked(expectedRevision: number): Promise<boolean> {
    // Checked again here too: Replace reaches this only after asking the server for the latest revision.
    if (!windowOpenNow()) { sendingRef.current = false; setSaving(false); return false }
    const problem = validatePlannerDay(input, blockIds)
    if (problem) { sendingRef.current = false; setSaving(false); setSaveError(problem); return false }
    setSaved(false)
    setSaveError(null)
    drafts.persist(input) // make sure the draft exists before the call, in case it never comes back
    const result = await savePlannerDay(input, expectedRevision)
    sendingRef.current = false
    setSaving(false)
    // "Saved" only once the server has saved it — a refusal or failure shows the error banner instead.
    if (result.ok) {
      revisionRef.current = result.revision // the next save is checked against the revision this one created
      setBaseline(JSON.stringify(input))
      setSaved(true)
      setUnsent(false)
      setConflict(false)
      drafts.clear() // the draft has done its job only once the server has confirmed
      return true
    }
    // A stale save is not a failure to retry: the user chooses (see the conflict banner). Anything else stays on the device.
    if (result.conflict) { setConflict(true); setUnsent(false) } else { setUnsent(true) }
    return false
  }

  function handleSaveDay() { void send(revisionRef.current) }

  async function handleReplace() {
    setConfirmReplace(false)
    if (!editableDay || sendingRef.current || !windowOpenNow()) return
    // Lock the day BEFORE asking for the latest revision, so nothing can be edited between the confirmation and the
    // send (what is sent, what the draft holds and what is on screen stay the same). Released on every exit path.
    sendingRef.current = true
    setSaving(true)
    let latest: number | null = null
    try {
      latest = await peekPlannerRevision() // the freshly stored revision, fetched only after the user confirmed
    } catch {
      latest = null
    }
    if (latest === null) { sendingRef.current = false; setSaving(false); return }
    await sendLocked(latest)
  }

  // Unsent figures on a day that can no longer be saved (window closed, or the roster changed): shown read-only, never sent.
  const unsendable = canEdit && !editableDay ? (dirty ? input : (drafts.restored ?? drafts.pending)) : null
  function discardUnsendable() {
    drafts.discard()
    if (dirty) {
      // Figures typed in this session: put the stored day back so nothing unsent-looking stays on screen.
      setLogs(stored.logs)
      setUnplanned(stored.unplanned)
      setBaseline(JSON.stringify(toInput(stored.logs, stored.unplanned)))
      setSaved(false)
      setSaveError(null)
      setUnsent(false)
      setConflict(false)
    }
  }

  // When the connection returns, send the unsent day again (only for a day still inside its window).
  useEffect(() => {
    if (!unsent || !editableDay) return
    const retry = () => { void send(revisionRef.current) }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
    // send closes over the current day, so re-subscribe when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsent, editableDay, input])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ShiftBanner loading={resolvedShiftLoading} error={resolvedShiftError} shift={resolvedShift} tlName={tlName} date={selectedDate} />
        {editableDay && (
          <button
            type="button"
            disabled={saving || !!drafts.pending}
            onClick={openUnplannedDraft}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Log unplanned work
          </button>
        )}
      </div>

      {canEdit && !windowState.editable && (
        <p className={mutedTextCls}>
          {windowState.reason === 'future'
            ? PLANNER_MESSAGES.notStarted
            : 'Locked — a planner day can be changed on the day, or until 12:00 the next day.'}
        </p>
      )}
      {plannerRosterMismatch && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3" role="status">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            The roster for this day changed after entries were saved. The entries below were recorded against a different shift and cannot be edited here.
          </p>
        </div>
      )}
      {noShift && editableDay && <p className={mutedTextCls}>{PLANNER_MESSAGES.noShift}</p>}

      {editableDay && (
        <ActivityDraftNotice
          restored={!!startFrom && !saved}
          unsent={unsent}
          retrying={saving}
          onRetry={handleSaveDay}
          pending={!!drafts.pending}
          onUsePending={() => {
            if (!drafts.pending) return
            setLogs(logsFromInput(drafts.pending.blocks, tlId, selectedDate))
            setUnplanned(unplannedFromInput(drafts.pending.unplanned, tlId, selectedDate))
            drafts.acceptPending(drafts.pending)
          }}
          onDiscardPending={drafts.discard}
        />
      )}
      {conflict && editableDay && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 space-y-2" role="alert">
          <p className="text-sm text-red-800 dark:text-red-200">
            Your changes were not saved: newer changes were saved elsewhere since you opened this day. Nothing has been overwritten, and what you typed is kept on this device.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => reloadPlannerDay()} className={btnOutline}>Reload latest</button>
            <button type="button" onClick={() => setConfirmReplace(true)} className={btnOutline}>Replace the saved day with my version…</button>
          </div>
        </div>
      )}
      {unsendable && (unsendable.blocks.length > 0 || unsendable.unplanned.length > 0) && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-2" role="status">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {!windowState.editable
              ? 'This day can no longer be saved. Unsent entries from this device — copy them if a correction is needed:'
              : plannerRosterMismatch
                ? 'The roster for this day changed, so this day can no longer be saved here. Unsent entries from this device — copy them if a correction is needed:'
                : resolvedShiftError
                  ? 'The roster for this day could not be read, so these unsent entries from this device cannot be checked or saved right now — reload to try again, or copy them:'
                  : 'The roster shift for this day changed since these entries were typed on this device, so they cannot be saved here. Discard them to record the day on the current shift — copy them first if a correction is needed:'}
          </p>
          <ul className="text-sm text-amber-900 dark:text-amber-200 list-disc pl-5">
            {summariseInput(unsendable).map((line, i) => <li key={i}>{line}</li>)}
          </ul>
          <button type="button" onClick={discardUnsendable} className={btnOutline}>Discard</button>
        </div>
      )}

      <DaySummary summary={summary} showReasons={showReasons} onToggleReasons={() => setShowReasons((v) => !v)} />

      {shownBlocks.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className={sectionTitleCls}>Planned blocks</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className={tableHeadCls}>
                  <th className="px-4 py-2.5">Time</th>
                  <th className="px-4 py-2.5">Activity</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Counted</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {shownBlocks.map((block) => (
                  <BlockRow
                    key={block.id}
                    block={block}
                    log={logFor(block.id)}
                    canEdit={editableDay}
                    disabled={saving || !!drafts.pending}
                    onStatusChange={(s) => handleStatusChange(block, s)}
                    onFieldChange={(field, value) => updateBlockField(block, field, value)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className={sectionTitleCls}>Unplanned work</h2>
          <span className={mutedTextCls}>Work with no matching template block</span>
        </div>
        {unplanned.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No unplanned work logged for this day.</div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {unplanned.map((entry) => {
              // Labelled from every template in code (ids are unique across them), so a block displaced on the old
              // shift still shows after a roster change instead of silently disappearing.
              const displaced = SHIFT_TEMPLATE_BLOCKS.find((b) => b.id === entry.displaced_block_id)
              return (
                <div key={entry.id} className="px-5 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`${badgeCls} ${CATEGORY_CHIP_CLS[entry.category]}`}>{CATEGORY_LABELS[entry.category]}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{formatDuration(entry.minutes)}</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{entry.reason}</p>
                    {displaced && <p className={`${mutedTextCls} mt-0.5`}>Displaced: {displaced.activity}</p>}
                  </div>
                  {!fieldsLocked && (
                    <button type="button" onClick={() => removeUnplanned(entry.id)} className="shrink-0 text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium">
                      Remove
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {saveError && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{saveError}</p>}

      {editableDay && (
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className={mutedTextCls}>Unsaved changes</span>}
          {saved && !dirty && (
            <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
          <button type="button" onClick={handleSaveDay} disabled={saving || !dirty} className={btnPrimary}>
            {saving ? 'Saving…' : 'Save day'}
          </button>
        </div>
      )}

      <Modal
        open={blockDraft !== null}
        onClose={() => setBlockDraft(null)}
        title={blockDraft ? `${BLOCK_STATUS_LABELS[blockDraft.status]} — ${blockDraft.block.activity}` : ''}
      >
        {blockDraft && (
          <div className="space-y-4">
            {blockDraft.status === 'moved' && (
              <>
                <div>
                  <label className={labelCls} htmlFor="tm-draft-minutes">Actual duration (minutes)</label>
                  <input id="tm-draft-minutes" type="number" min={1} value={blockDraft.actualMinutes}
                    onChange={(e) => setBlockDraft({ ...blockDraft, actualMinutes: Number(e.target.value) })} className={inputCls} />
                  <p className={`${mutedTextCls} mt-1`}>Planned {formatDuration(blockMinutes(blockDraft.block))}.</p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="tm-draft-category">Category it was actually spent on</label>
                  <select id="tm-draft-category" value={blockDraft.category}
                    onChange={(e) => setBlockDraft({ ...blockDraft, category: e.target.value as PlannerCategory })} className={inputCls}>
                    {PLANNER_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="tm-draft-activity">What was done instead (optional)</label>
                  <input id="tm-draft-activity" type="text" maxLength={200} value={blockDraft.activity}
                    onChange={(e) => setBlockDraft({ ...blockDraft, activity: e.target.value })} className={inputCls} />
                </div>
              </>
            )}
            {blockDraft.status === 'not_completed' && (
              <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                This block will count zero minutes toward the day. A reason is still required so it never reads as
                unexplained missed work.
              </p>
            )}
            <div>
              <label className={labelCls} htmlFor="tm-draft-reason">Reason (required)</label>
              <textarea id="tm-draft-reason" rows={3} value={blockDraft.reason}
                onChange={(e) => setBlockDraft({ ...blockDraft, reason: e.target.value })} className={`${inputCls} resize-none`} placeholder="What happened?" />
            </div>
            {blockDraft.reason.trim() !== '' && blockDraftError && <p className="text-sm text-red-700 dark:text-red-400">{blockDraftError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setBlockDraft(null)} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={saveBlockDraft} disabled={blockDraftError !== null} className={btnPrimary}>Save</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={confirmReplace} onClose={() => setConfirmReplace(false)} title="Replace the saved day?">
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Replacing the day will overwrite the changes that were saved since you opened it. This cannot be undone from the app.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setConfirmReplace(false)} className={btnSecondary}>Cancel</button>
            <button type="button" onClick={handleReplace} className={btnPrimary}>Replace day</button>
          </div>
        </div>
      </Modal>

      <Modal open={unplannedDraft !== null}onClose={() => setUnplannedDraft(null)} title="Log unplanned work">
        {unplannedDraft && (
          <div className="space-y-4">
            <div>
              <label className={labelCls} htmlFor="tm-unp-category">Category</label>
              <select id="tm-unp-category" value={unplannedDraft.category}
                onChange={(e) => setUnplannedDraft({ ...unplannedDraft, category: e.target.value as PlannerCategory })} className={inputCls}>
                {PLANNER_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="tm-unp-minutes">Minutes</label>
              <input id="tm-unp-minutes" type="number" min={1} value={unplannedDraft.minutes}
                onChange={(e) => setUnplannedDraft({ ...unplannedDraft, minutes: Number(e.target.value) })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="tm-unp-displaced">Displaced a planned block (optional)</label>
              <select id="tm-unp-displaced" value={unplannedDraft.displacedBlockId}
                onChange={(e) => setUnplannedDraft({ ...unplannedDraft, displacedBlockId: e.target.value })} className={inputCls}>
                <option value="">None</option>
                {blocks.map((b) => <option key={b.id} value={b.id}>{b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)} {b.activity}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="tm-unp-reason">Reason (required)</label>
              <textarea id="tm-unp-reason" rows={3} value={unplannedDraft.reason}
                onChange={(e) => setUnplannedDraft({ ...unplannedDraft, reason: e.target.value })} className={`${inputCls} resize-none`} placeholder="What came up?" />
            </div>
            {unplannedDraft.reason.trim() !== '' && unplannedDraftError && <p className="text-sm text-red-700 dark:text-red-400">{unplannedDraftError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setUnplannedDraft(null)} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={saveUnplannedDraft} disabled={unplannedDraftError !== null} className={btnPrimary}>Add entry</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function BlockRow({
  block, log, canEdit, disabled, onStatusChange, onFieldChange,
}: {
  block: ShiftTemplateBlock
  log: PlannerBlockLog | undefined
  canEdit: boolean
  /** Fields stay visible but cannot be changed (a save is in flight). */
  disabled: boolean
  onStatusChange: (status: BlockStatus) => void
  onFieldChange: (field: 'actual_activity' | 'actual_category' | 'actual_minutes', value: string) => void
}) {
  const status = log?.status ?? 'planned'
  const Icon = BLOCK_STATUS_ICON[status]
  const counted = effectiveMinutes(log, block)
  const reportedCategory = effectiveCategory(log, block) ?? block.category
  const reportedActivity = effectiveActivity(log, block)
  const time = `${block.start_time.slice(0, 5)}–${block.end_time.slice(0, 5)}`
  // Activity, category and minutes are only reported once a block counts toward the day (completed or moved).
  const editableNow = canEdit && isReportable(status)

  return (
    <tr className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 align-top">
      <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{time}</td>
      <td className="px-4 py-2.5 min-w-[200px]">
        {editableNow ? (
          <input
            type="text"
            maxLength={200}
            defaultValue={log?.actual_activity ?? ''}
            placeholder={block.activity}
            onBlur={(e) => onFieldChange('actual_activity', e.target.value)}
            aria-label={`Activity for the ${time} block`}
            disabled={disabled}
            className={inputCls}
          />
        ) : (
          <div className="text-gray-900 dark:text-white">{reportedActivity}</div>
        )}
        {log?.reason && <div className={`${mutedTextCls} mt-1 max-w-md`}>{log.reason}</div>}
      </td>
      <td className="px-4 py-2.5 min-w-[160px]">
        {editableNow ? (
          <select
            value={log?.actual_category ?? block.category}
            onChange={(e) => onFieldChange('actual_category', e.target.value)}
            aria-label={`Category for the ${time} block`}
            disabled={disabled}
            className={inputCls}
          >
            {PLANNER_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        ) : (
          <>
            <span className={`${badgeCls} ${CATEGORY_CHIP_CLS[reportedCategory]}`}>{CATEGORY_LABELS[reportedCategory]}</span>
            {reportedCategory !== block.category && <div className={`${mutedTextCls} mt-0.5`}>was {CATEGORY_LABELS[block.category]}</div>}
          </>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {editableNow ? (
          <input
            type="number"
            min={1}
            max={1440}
            value={log?.actual_minutes ?? ''}
            onChange={(e) => onFieldChange('actual_minutes', e.target.value)}
            aria-label={`Minutes for the ${time} block`}
            disabled={disabled}
            className={`${inputCls} w-24`}
          />
        ) : (
          <>
            <span className={counted === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white font-medium'}>{formatDuration(counted)}</span>
            {counted !== blockMinutes(block) && <div className={mutedTextCls}>of {formatDuration(blockMinutes(block))}</div>}
          </>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`${badgeCls} ${BLOCK_STATUS_CLS[status]}`}><Icon className="w-3 h-3" />{BLOCK_STATUS_LABELS[status]}</span>
          {canEdit && (
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value as BlockStatus)}
              aria-label={`Set status for the ${time} block`}
              disabled={disabled}
              className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{BLOCK_STATUS_LABELS[s]}</option>)}
            </select>
          )}
        </div>
      </td>
    </tr>
  )
}

/**
 * Replaces the old manual "Shift template" dropdown — shows what the
 * roster resolved for this team leader/date, rather than letting anyone
 * pick a template by hand.
 */
function ShiftBanner({
  loading, error, shift, tlName, date,
}: {
  loading: boolean
  error: string | null
  shift: ReturnType<typeof useLeadOpsData>['resolvedShift']
  tlName: string
  date: string
}) {
  if (loading) {
    return (
      <p className={`${mutedTextCls} flex items-center gap-2`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Reading {tlName}&apos;s roster for {date}…
      </p>
    )
  }
  if (error) {
    return (
      <p className="text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
      </p>
    )
  }
  if (!shift || shift.kind === 'unknown') {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" /> No roster shift could be resolved for {tlName} on {date}.
      </p>
    )
  }
  if (shift.kind === 'off') {
    return <p className={mutedTextCls}>{tlName} is rostered off on {date}.</p>
  }
  return (
    <p className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
      <Clock className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
      {tlName} · {date} · {shift.startTime.slice(0, 5)}–{shift.endTime.slice(0, 5)} ({shift.kind === 'early' ? 'Early' : 'Late'} shift, from the roster)
    </p>
  )
}

function DaySummary({
  summary, showReasons, onToggleReasons,
}: { summary: ReturnType<typeof summariseDay>; showReasons: boolean; onToggleReasons: () => void }) {
  const total = summary.actualMinutes
  const barRef = useRef<HTMLDivElement>(null)
  const widthKey = summary.categoryTotals.map((t) => `${t.category}:${t.minutes}`).join('|')

  useEffect(() => {
    const node = barRef.current
    if (!node) return
    const segments = Array.from(node.children) as HTMLElement[]
    if (segments.length === 0) return
    const targetWidth = (el: HTMLElement) => el.dataset.width ?? '0%'
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      segments.forEach((el) => { el.style.width = targetWidth(el) })
      return
    }
    animate(segments, { width: (el: HTMLElement) => targetWidth(el), duration: 420, ease: 'outQuad' })
  }, [widthKey])

  return (
    <div className={`${cardCls} p-5 space-y-3`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={mutedTextCls}>Planned</span>
        <span className="text-2xl font-semibold text-gray-900 dark:text-white">{formatDuration(summary.plannedMinutes)}</span>
        <span className="text-gray-400 dark:text-gray-500">→</span>
        <span className={mutedTextCls}>Actual</span>
        <span className="text-2xl font-semibold text-gray-900 dark:text-white">{formatDuration(summary.actualMinutes)}</span>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {formatDuration(summary.actualWorkMinutes)}<span className="text-sm font-normal text-gray-500 dark:text-gray-400"> of {formatDuration(summary.plannedWorkMinutes)}</span>
          </p>
          <p className={mutedTextCls}>Work</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {formatDuration(summary.actualBreakMinutes)}<span className="text-sm font-normal text-gray-500 dark:text-gray-400"> of {formatDuration(summary.plannedBreakMinutes)}</span>
          </p>
          <p className={mutedTextCls}>Lunch</p>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nothing logged yet — mark blocks as completed, moved or not completed to build the day.</p>
      ) : (
        <>
          <div ref={barRef} className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-200 dark:bg-gray-800">
            {summary.categoryTotals.map((t) => (
              <div key={t.category} className={CATEGORY_BAR_CLS[t.category]} data-width={`${(t.minutes / total) * 100}%`} title={`${CATEGORY_LABELS[t.category]} ${formatDuration(t.minutes)}`} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {summary.categoryTotals.map((t) => (
              <span key={t.category} className="inline-flex items-center gap-1.5 text-sm">
                <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_BAR_CLS[t.category]}`} />
                <span className="text-gray-700 dark:text-gray-300">{CATEGORY_LABELS[t.category]}</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatDuration(t.minutes)}</span>
              </span>
            ))}
          </div>
        </>
      )}

      {summary.unplannedOrMovedMinutes > 0 && (
        <div className="pt-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{formatDuration(summary.unplannedOrMovedMinutes)} of today was unplanned or moved</span>
            <button type="button" onClick={onToggleReasons} className="underline font-medium">{showReasons ? 'hide reasons' : 'view reasons'}</button>
          </div>
        </div>
      )}

      {showReasons && summary.reasons.length > 0 && (
        <ul className="space-y-2 pt-1">
          {summary.reasons.map((r, i) => (
            <li key={i} className="text-sm border-l-2 border-gray-200 dark:border-gray-700 pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${badgeCls} ${BLOCK_STATUS_CLS[r.kind === 'unplanned' ? 'moved' : r.kind]}`}>{r.kind === 'unplanned' ? 'Unplanned' : BLOCK_STATUS_LABELS[r.kind]}</span>
                <span className="text-gray-900 dark:text-white font-medium">{formatDuration(r.minutes)}</span>
              </div>
              <p className="text-gray-700 dark:text-gray-300 mt-0.5">{r.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
