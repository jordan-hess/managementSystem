'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cardCls, mutedTextCls, sectionTitleCls, tableHeadCls } from '@/components/reports/theme'
import { useLeadOpsData } from '../LeadOpsDataProvider'
import { badgeCls, btnOutline, btnPrimary, inputCls, labelCls } from '../statusStyles'
import type { DailyActivityLog } from '@/lib/leadops/types'
import { MAX_NOTES, parseCount } from '@/lib/leadops/activityLimits'
import { draftKey, pastDailyDraftDates } from '@/lib/leadops/activityDrafts'
import { useActivityDraft } from './useActivityDraft'
import ActivityDraftNotice from './ActivityDraftNotice'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type DailyField = 'calls_listened' | 'tickets_reviewed' | 'audits_completed' | 'critical_fails' | 'coaching_sessions' | 'notes'
const DAILY_FIELDS: readonly DailyField[] = ['calls_listened', 'tickets_reviewed', 'audits_completed', 'critical_fails', 'coaching_sessions', 'notes']

interface Props {
  tlId: string
  tlName: string
  /** Team Leader entering their own, or Admin entering on their behalf. */
  canEdit: boolean
}

interface Draft {
  calls_listened: string
  tickets_reviewed: string
  audits_completed: string
  critical_fails: string
  coaching_sessions: string
  agent_in_seat: boolean
  notes: string
}

function draftFromLog(log: DailyActivityLog | undefined): Draft {
  return {
    calls_listened: String(log?.calls_listened ?? ''),
    tickets_reviewed: String(log?.tickets_reviewed ?? ''),
    audits_completed: String(log?.audits_completed ?? ''),
    critical_fails: String(log?.critical_fails ?? ''),
    coaching_sessions: String(log?.coaching_sessions ?? ''),
    agent_in_seat: log?.agent_in_seat ?? false,
    notes: log?.notes ?? '',
  }
}

/**
 * Daily Activity — one date at a time, driven by the shared date selector at
 * the top of the page, rather than one giant table of every day. Editing a
 * different day is "pick a new date above", the same context-selector model
 * the brief asks for; a short recent-days list below gives one-click access
 * back to the last few without re-picking the date.
 */
/**
 * Keyed by `${tlId}-${selectedDate}` from DataEntryTab, so switching the
 * team leader or date remounts this component instead of syncing local
 * draft state via an effect — React's own recommended pattern for
 * "reset state when a prop changes" ("You Might Not Need an Effect"), and
 * it avoids a render where the draft still shows the previous day's figures
 * before an effect had a chance to fire.
 */
export default function DailySection({ tlId, tlName, canEdit }: Props) {
  const { dailyLogs, selectedDate, setSelectedDate, upsertDailyLog, todayDate } = useLeadOpsData()

  const existing = dailyLogs.find((l) => l.tl_id === tlId && l.date === selectedDate)
  // A day's entry can only be changed ON that day (South African date) — the server
  // enforces it too. Earlier days are shown read-only.
  const isToday = selectedDate === todayDate
  const canEditToday = canEdit && isToday
  // A device draft of what was typed (see lib/leadops/activityDrafts.ts). Read once at mount: this component
  // is remounted per team leader and day (the `key` in DataEntryTab). Only an editor's form has one.
  const drafts = useActivityDraft<Draft>(draftKey('daily', tlId, selectedDate), canEdit, existing ? draftFromLog(existing) : null)
  const [draft, setDraft] = useState<Draft>(() => (isToday && drafts.restored ? drafts.restored : draftFromLog(existing)))
  const [unsent, setUnsent] = useState(false)
  const sendingRef = useRef(false)
  /** Edit a field: update the form and keep the draft in step. */
  function edit(patch: Partial<Draft>) {
    const next = { ...draft, ...patch }
    setDraft(next)
    drafts.persist(next)
  }
  // Earlier days that still hold unsent figures, so they are not forgotten once midnight has passed.
  const earlierDraftDates = useMemo(
    () => (canEdit && isToday ? pastDailyDraftDates(tlId, todayDate) : []),
    [canEdit, isToday, tlId, todayDate],
  )
  const [saving, setSaving] = useState(false)
  // Locked while a save is in flight (so a correction cannot be wiped when that save confirms) and while the
  // Use them / Discard offer is open (so typing cannot replace the stored draft before the user has chosen).
  const fieldsLocked = !canEditToday || saving || !!drafts.pending
  const [saved, setSaved] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll } = useFormErrors<DailyField>(DAILY_FIELDS)
  const hasError = !formError && Object.keys(fieldErrors).length > 0

  const recentDates = [...new Set(dailyLogs.filter((l) => l.tl_id === tlId).map((l) => l.date))]
    .sort()
    .reverse()
    .slice(0, 5)

  async function handleSave() {
    if (sendingRef.current) return // a send is already in flight (a double click, or Retry + the online event together)
    clearAll()
    const errs: Partial<Record<DailyField, string>> = {}
    // Records the error for an invalid metric and returns 0 so every metric is checked, not just the first bad one.
    // The same rule the server and the database enforce: a whole number from 0 to 10,000 (empty = 0).
    const toNumber = (v: string, label: string, key: DailyField): number => {
      const parsed = parseCount(v)
      if (!parsed.ok) {
        errs[key] = `${label} must be a whole number from 0 to 10,000.`
        return 0
      }
      return parsed.value
    }

    const calls = toNumber(draft.calls_listened, 'Calls listened', 'calls_listened')
    const tickets = toNumber(draft.tickets_reviewed, 'Tickets reviewed', 'tickets_reviewed')
    const audits = toNumber(draft.audits_completed, 'Audits completed', 'audits_completed')
    const fails = toNumber(draft.critical_fails, 'Critical fails logged', 'critical_fails')
    const coaching = toNumber(draft.coaching_sessions, 'Coaching sessions held', 'coaching_sessions')
    if (draft.notes.length > MAX_NOTES) errs.notes = 'Notes must be 2,000 characters or fewer.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    sendingRef.current = true
    setSaving(true)
    setSaved(false)
    drafts.persist(draft) // make sure the draft exists before the call, in case it never comes back
    const ok = await upsertDailyLog({
      id: existing?.id ?? `daily-${tlId}-${selectedDate}`,
      tl_id: tlId,
      date: selectedDate,
      calls_listened: calls,
      tickets_reviewed: tickets,
      audits_completed: audits,
      critical_fails: fails,
      coaching_sessions: coaching,
      agent_in_seat: draft.agent_in_seat,
      notes: draft.notes.trim() || null,
      created_at: existing?.created_at ?? '',
      updated_at: '',
    })
    sendingRef.current = false
    setSaving(false)
    // "Saved" only once the server has saved it — a refusal or failure shows the error banner, and the draft
    // stays on the device until a later save is confirmed.
    setSaved(ok)
    setUnsent(!ok)
    if (ok) drafts.clear()
  }

  // When the connection comes back, send the unsent entry again (today's only — a past day can never be saved).
  useEffect(() => {
    if (!unsent || !canEditToday) return
    const retry = () => { void handleSave() }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
    // handleSave closes over the current form values, so re-subscribe when they change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsent, canEditToday, draft])

  // A draft for a day that has passed can never be sent; show it read-only so the figures are not lost silently.
  const passedDraft = canEdit && !isToday ? (drafts.restored ?? drafts.pending) : null
  const passedSummary = passedDraft
    ? (() => {
        const n = (v: string) => (v.trim() === '' ? '0' : v)
        return `Calls listened ${n(passedDraft.calls_listened)}, Tickets reviewed ${n(passedDraft.tickets_reviewed)}, Audits completed ${n(passedDraft.audits_completed)}, Critical fails ${n(passedDraft.critical_fails)}, Coaching sessions ${n(passedDraft.coaching_sessions)}, Agent-in-seat ${passedDraft.agent_in_seat ? 'Yes' : 'No'}${passedDraft.notes ? `, notes: ${passedDraft.notes}` : ''}`
      })()
    : null

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className={sectionTitleCls}>Daily activity — {tlName}</h2>
            <p className={mutedTextCls}>{selectedDate}. Coaching sessions and agent-in-seat here roll up into the Weekly Activity Log automatically — they are not entered again there.</p>
          </div>
          {!canEdit && (
            <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400`}>View only</span>
          )}
          {canEdit && !isToday && (
            <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400`}>Locked</span>
          )}
        </div>

        {canEditToday && (
          <ActivityDraftNotice
            restored={!!drafts.restored && !saved}
            unsent={unsent}
            retrying={saving}
            onRetry={handleSave}
            pending={!!drafts.pending}
            onUsePending={() => { if (drafts.pending) { setDraft(drafts.pending); drafts.acceptPending(drafts.pending) } }}
            onDiscardPending={drafts.discard}
          />
        )}
        {earlierDraftDates.length > 0 && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-2" role="status">
            {earlierDraftDates.map((date) => (
              <div key={date} className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-amber-900 dark:text-amber-200">Unsent figures from {date} are still on this device.</p>
                <button type="button" onClick={() => setSelectedDate(date)} className={btnOutline}>View {date}</button>
              </div>
            ))}
          </div>
        )}
        {passedSummary && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-2" role="status">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              This day has passed and can no longer be saved. Unsent figures from this device — copy them if a correction is needed:
            </p>
            <p className="text-sm text-amber-900 dark:text-amber-200">{passedSummary}</p>
            <button type="button" onClick={drafts.discard} className={btnOutline}>Discard</button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field id="daily-calls_listened" label="Calls listened" value={draft.calls_listened} onChange={(v) => { edit({ calls_listened: v }); clearFieldError('calls_listened') }} disabled={fieldsLocked} error={fieldErrors.calls_listened} />
          <Field id="daily-tickets_reviewed" label="Tickets reviewed" value={draft.tickets_reviewed} onChange={(v) => { edit({ tickets_reviewed: v }); clearFieldError('tickets_reviewed') }} disabled={fieldsLocked} error={fieldErrors.tickets_reviewed} />
          <Field id="daily-audits_completed" label="Audits completed" value={draft.audits_completed} onChange={(v) => { edit({ audits_completed: v }); clearFieldError('audits_completed') }} disabled={fieldsLocked} error={fieldErrors.audits_completed} />
          <Field id="daily-critical_fails" label="Critical fails logged" value={draft.critical_fails} onChange={(v) => { edit({ critical_fails: v }); clearFieldError('critical_fails') }} disabled={fieldsLocked} error={fieldErrors.critical_fails} />
          <Field id="daily-coaching_sessions" label="Coaching sessions held" value={draft.coaching_sessions} onChange={(v) => { edit({ coaching_sessions: v }); clearFieldError('coaching_sessions') }} disabled={fieldsLocked} error={fieldErrors.coaching_sessions} />
          <div>
            <span className={labelCls}>Agent-in-seat day</span>
            <button
              type="button"
              disabled={fieldsLocked}
              onClick={() => edit({ agent_in_seat: !draft.agent_in_seat })}
              aria-pressed={draft.agent_in_seat}
              className={`${badgeCls} disabled:opacity-60 ${
                draft.agent_in_seat
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              {draft.agent_in_seat ? 'Yes' : 'No'}
            </button>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="daily-notes">Notes / evidence reference</label>
          <textarea
            id="daily-notes"
            rows={2}
            disabled={fieldsLocked}
            value={draft.notes}
            maxLength={MAX_NOTES}
            onChange={(e) => { edit({ notes: e.target.value }); clearFieldError('notes') }}
            className={`${fieldInputClass(inputCls, !!fieldErrors.notes)} resize-none`}
            {...fieldA11y('daily-notes', fieldErrors.notes)}
            placeholder="Optional — e.g. a QA reference, an escalation this day's numbers relate to."
          />
          <FieldError id="daily-notes" message={fieldErrors.notes} />
        </div>

        {!isToday && (
          <p className={mutedTextCls}>
            {existing
              ? "Locked — a day's entry can only be changed on that day."
              : 'Nothing was recorded for this day.'}
          </p>
        )}

        <FormErrorBanner message={formError} />

        {canEditToday && (
          <div className="flex items-center justify-end gap-3">
            {saved && !formError && !hasError && (
              <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}
            <button type="button" onClick={handleSave} disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : existing ? 'Save changes' : 'Save entry'}
            </button>
          </div>
        )}
      </div>

      {recentDates.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className={sectionTitleCls}>Recent entries — {tlName}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Calls</th>
                  <th className="px-4 py-2">Tickets</th>
                  <th className="px-4 py-2">Audits</th>
                  <th className="px-4 py-2">Coaching</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {recentDates.map((date) => {
                  const log = dailyLogs.find((l) => l.tl_id === tlId && l.date === date)!
                  return (
                    <tr key={date} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-2 text-gray-900 dark:text-white">{date}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{log.calls_listened}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{log.tickets_reviewed}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{log.audits_completed}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{log.coaching_sessions}</td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" onClick={() => setSelectedDate(date)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium">
                          {date === todayDate ? (date === selectedDate ? 'Editing' : 'Edit') : (date === selectedDate ? 'Viewing' : 'View')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  id, label, value, onChange, disabled, error,
}: { id: string; label: string; value: string; onChange: (v: string) => void; disabled: boolean; error?: string }) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={0}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldInputClass(inputCls, !!error)}
        {...fieldA11y(id, error)}
        placeholder="0"
      />
      <FieldError id={id} message={error} />
    </div>
  )
}
