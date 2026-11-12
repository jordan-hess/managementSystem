'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Lock } from 'lucide-react'
import { cardCls, mutedTextCls, sectionTitleCls } from '@/components/reports/theme'
import { weeklyRollupFromDaily } from '@/lib/leadops/rollups'
import { useLeadOpsData } from '../LeadOpsDataProvider'
import { badgeCls, btnPrimary, inputCls, labelCls } from '../statusStyles'
import type { ManagerWeeklyLog, WeeklyManualLog } from '@/lib/leadops/types'
import { parseCount } from '@/lib/leadops/activityLimits'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import { draftKey } from '@/lib/leadops/activityDrafts'
import { useActivityDraft } from './useActivityDraft'
import ActivityDraftNotice from './ActivityDraftNotice'

interface WeeklyDraft { calibration: boolean; reAudits: string }
interface ManagerDraft { sampled: string; spotCheck: boolean; oneOnOnes: string }

const countMessage = (label: string) => `${label} must be a whole number from 0 to 10,000.`

interface Props {
  tlId: string
  tlName: string
  /** Team Leader entering their own, or Admin on their behalf. */
  canEditTlFields: boolean
  /** Management only — also gates whether the Manager weekly card renders AT ALL, not just whether it's editable (this is Management's own record, never a Team Leader's or Admin's to see). */
  canEditManagerFields: boolean
}

/**
 * Weekly Activity — calibration attended and re-audits completed are the
 * only genuinely manual fields left; coaching sessions, agent-in-seat days
 * and critical fails are rolled up read-only from Daily Activity (see
 * lib/leadops/rollups.ts) rather than re-entered, so the same figure is
 * never typed twice.
 */
/**
 * Keyed by `${tlId}-${selectedWeekStart}` from DataEntryTab, so switching
 * the team leader or week remounts this component rather than syncing local
 * draft state via an effect — same reasoning as DailySection.tsx. The
 * manager fields do not depend on tlId, so a TL-only change re-derives them
 * to the identical values on remount; harmless, and simpler than splitting
 * this into two independently-keyed components.
 */
export default function WeeklySection({ tlId, tlName, canEditTlFields, canEditManagerFields }: Props) {
  const {
    dailyLogs, weeklyLogs, managerLogs, selectedWeekStart, setSelectedWeekStart,
    upsertWeeklyLog, upsertManagerLog, weekStarts, people, peopleError,
  } = useLeadOpsData()

  const existingWeekly = weeklyLogs.find((l) => l.tl_id === tlId && l.week_of === selectedWeekStart)
  // Device drafts: read once at mount (this component is remounted per team leader and week).
  const tlDraft = useActivityDraft<WeeklyDraft>(
    draftKey('weekly', tlId, selectedWeekStart),
    canEditTlFields,
    existingWeekly ? { calibration: existingWeekly.calibration, reAudits: String(existingWeekly.re_audits) } : null,
  )
  const [calibration, setCalibration] = useState(tlDraft.restored?.calibration ?? existingWeekly?.calibration ?? false)
  const [reAudits, setReAudits] = useState(tlDraft.restored?.reAudits ?? String(existingWeekly?.re_audits ?? ''))
  const [savedTl, setSavedTl] = useState(false)
  const [unsentTl, setUnsentTl] = useState(false)
  const [sendingTl, setSendingTl] = useState(false)
  const sendingTlRef = useRef(false)
  const [reAuditsError, setReAuditsError] = useState<string | undefined>()

  const managerLog = people ? managerLogs.find((m) => m.manager_id === people.managerId && m.week_of === selectedWeekStart) : undefined
  const mgrDraft = useActivityDraft<ManagerDraft>(
    draftKey('manager', people?.managerId ?? 'none', selectedWeekStart),
    canEditManagerFields && !!people,
    managerLog
      ? { sampled: String(managerLog.interactions_sampled), spotCheck: managerLog.calibration_spot_check, oneOnOnes: String(managerLog.tl_one_on_ones) }
      : null,
  )
  const [sampled, setSampled] = useState(mgrDraft.restored?.sampled ?? String(managerLog?.interactions_sampled ?? ''))
  const [spotCheck, setSpotCheck] = useState(mgrDraft.restored?.spotCheck ?? managerLog?.calibration_spot_check ?? false)
  const [oneOnOnes, setOneOnOnes] = useState(mgrDraft.restored?.oneOnOnes ?? String(managerLog?.tl_one_on_ones ?? ''))
  const [savedMgr, setSavedMgr] = useState(false)
  const [unsentMgr, setUnsentMgr] = useState(false)
  const [sendingMgr, setSendingMgr] = useState(false)
  const sendingMgrRef = useRef(false)
  const [sampledError, setSampledError] = useState<string | undefined>()
  const [oneOnOnesError, setOneOnOnesError] = useState<string | undefined>()

  const rollup = weeklyRollupFromDaily(dailyLogs, tlId, selectedWeekStart)

  async function saveTl() {
    if (sendingTlRef.current) return
    const parsed = parseCount(reAudits)
    if (!parsed.ok) { setReAuditsError(countMessage('Re-audits completed')); return }
    setReAuditsError(undefined)
    const next: WeeklyManualLog = {
      tl_id: tlId,
      week_of: selectedWeekStart,
      calibration,
      re_audits: parsed.value,
    }
    sendingTlRef.current = true
    setSendingTl(true)
    setSavedTl(false)
    tlDraft.persist({ calibration, reAudits })
    const ok = await upsertWeeklyLog(next) // "Saved" only once the server has saved it
    sendingTlRef.current = false
    setSendingTl(false)
    setSavedTl(ok)
    setUnsentTl(!ok)
    if (ok) tlDraft.clear() // the draft stays on the device until a save is confirmed
  }

  async function saveManager() {
    if (!people || sendingMgrRef.current) return
    const s = parseCount(sampled)
    const o = parseCount(oneOnOnes)
    // Check both fields so every bad one is highlighted, not just the first.
    setSampledError(s.ok ? undefined : countMessage('Interactions sampled'))
    setOneOnOnesError(o.ok ? undefined : countMessage('TL 1:1s held'))
    if (!s.ok || !o.ok) return
    const next: ManagerWeeklyLog = {
      manager_id: people.managerId,
      week_of: selectedWeekStart,
      interactions_sampled: s.value,
      calibration_spot_check: spotCheck,
      tl_one_on_ones: o.value,
    }
    sendingMgrRef.current = true
    setSendingMgr(true)
    setSavedMgr(false)
    mgrDraft.persist({ sampled, spotCheck, oneOnOnes })
    const ok = await upsertManagerLog(next) // "Saved" only once the server has saved it
    sendingMgrRef.current = false
    setSendingMgr(false)
    setSavedMgr(ok)
    setUnsentMgr(!ok)
    if (ok) mgrDraft.clear()
  }

  // When the connection comes back, send an unsent entry again.
  useEffect(() => {
    if (!unsentTl || !canEditTlFields) return
    const retry = () => { void saveTl() }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsentTl, canEditTlFields, calibration, reAudits])

  useEffect(() => {
    if (!unsentMgr || !canEditManagerFields) return
    const retry = () => { void saveManager() }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsentMgr, canEditManagerFields, sampled, spotCheck, oneOnOnes])

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="weekly-week">Week commencing</label>
        <select
          id="weekly-week"
          value={selectedWeekStart}
          onChange={(e) => setSelectedWeekStart(e.target.value)}
          className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]"
        >
          {weekStarts.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>

      {/* ── Team leader weekly fields ── */}
      <div className={`${cardCls} p-5 space-y-4`}>
        <div>
          <h2 className={sectionTitleCls}>Team leader weekly log — {tlName}</h2>
          <p className={mutedTextCls}>Team Leader entered · Admin can correct on their behalf</p>
        </div>

        {canEditTlFields && (
          <ActivityDraftNotice
            restored={!!tlDraft.restored && !savedTl}
            unsent={unsentTl}
            retrying={sendingTl}
            onRetry={saveTl}
            pending={!!tlDraft.pending}
            onUsePending={() => { if (tlDraft.pending) { setCalibration(tlDraft.pending.calibration); setReAudits(tlDraft.pending.reAudits); tlDraft.acceptPending(tlDraft.pending) } }}
            onDiscardPending={tlDraft.discard}
          />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <span className={labelCls}>Calibration attended</span>
            <button
              type="button"
              disabled={!canEditTlFields || sendingTl || !!tlDraft.pending}
              onClick={() => { const next = !calibration; setCalibration(next); tlDraft.persist({ calibration: next, reAudits }) }}
              aria-pressed={calibration}
              className={`${badgeCls} disabled:opacity-60 ${calibration ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
            >
              {calibration ? 'Yes' : 'No'}
            </button>
          </div>
          <div>
            <label className={labelCls} htmlFor="weekly-reaudits">Re-audits completed</label>
            <input
              id="weekly-reaudits"
              type="number"
              min={0}
              disabled={!canEditTlFields || sendingTl || !!tlDraft.pending}
              value={reAudits}
              onChange={(e) => { setReAudits(e.target.value); setReAuditsError(undefined); tlDraft.persist({ calibration, reAudits: e.target.value }) }}
              className={fieldInputClass(inputCls, !!reAuditsError)}
              {...fieldA11y('weekly-reaudits', reAuditsError)}
            />
            <FieldError id="weekly-reaudits" message={reAuditsError} />
          </div>
        </div>

        {/* The three rolled-up fields — read-only everywhere, including for the TL. */}
        <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100 dark:border-gray-800">
          <RollupField label="Coaching sessions held" value={rollup.coachingSessions} />
          <RollupField label="Agent-in-seat days" value={rollup.agentInSeatDays} />
          <RollupField label="Critical fails logged" value={rollup.criticalFails} />
        </div>
        <p className={mutedTextCls}>Rolled up automatically from this week&apos;s Daily Activity entries — not re-entered here.</p>

        {canEditTlFields && (
          <div className="flex items-center justify-end gap-3">
            {savedTl && <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
            <button type="button" onClick={saveTl} className={btnPrimary}>Save</button>
          </div>
        )}
      </div>

      {/* ── Manager weekly fields — Management's own record, not the TL's; never shown to a Team Leader or Admin. ── */}
      {canEditManagerFields && !people && (
        <div className={`${cardCls} p-5`}>
          <h2 className={sectionTitleCls}>Manager weekly log</h2>
          <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Manager not configured</p>
            <p className={`${mutedTextCls} mt-0.5`}>{peopleError ?? 'The manager for this log could not be determined.'}</p>
          </div>
        </div>
      )}
      {canEditManagerFields && people && (
        <div className={`${cardCls} p-5 space-y-4`}>
          <div>
            <h2 className={sectionTitleCls}>Manager weekly log</h2>
            <p className={mutedTextCls}>{people.managerName}, week of {selectedWeekStart}</p>
          </div>
          <ActivityDraftNotice
            restored={!!mgrDraft.restored && !savedMgr}
            unsent={unsentMgr}
            retrying={sendingMgr}
            onRetry={saveManager}
            pending={!!mgrDraft.pending}
            onUsePending={() => { if (mgrDraft.pending) { setSampled(mgrDraft.pending.sampled); setSpotCheck(mgrDraft.pending.spotCheck); setOneOnOnes(mgrDraft.pending.oneOnOnes); mgrDraft.acceptPending(mgrDraft.pending) } }}
            onDiscardPending={mgrDraft.discard}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls} htmlFor="mgr-sampled">Interactions sampled</label>
              <input
                id="mgr-sampled" type="number" min={0} value={sampled} disabled={sendingMgr || !!mgrDraft.pending}
                onChange={(e) => { setSampled(e.target.value); setSampledError(undefined); mgrDraft.persist({ sampled: e.target.value, spotCheck, oneOnOnes }) }}
                className={fieldInputClass(inputCls, !!sampledError)} {...fieldA11y('mgr-sampled', sampledError)}
              />
              <FieldError id="mgr-sampled" message={sampledError} />
            </div>
            <div>
              <label className={labelCls} htmlFor="mgr-onetoones">TL 1:1s held</label>
              <input
                id="mgr-onetoones" type="number" min={0} value={oneOnOnes} disabled={sendingMgr || !!mgrDraft.pending}
                onChange={(e) => { setOneOnOnes(e.target.value); setOneOnOnesError(undefined); mgrDraft.persist({ sampled, spotCheck, oneOnOnes: e.target.value }) }}
                className={fieldInputClass(inputCls, !!oneOnOnesError)} {...fieldA11y('mgr-onetoones', oneOnOnesError)}
              />
              <FieldError id="mgr-onetoones" message={oneOnOnesError} />
            </div>
            <div>
              <span className={labelCls}>Calibration spot-check attended</span>
              <button
                type="button"
                disabled={sendingMgr || !!mgrDraft.pending}
                onClick={() => { const next = !spotCheck; setSpotCheck(next); mgrDraft.persist({ sampled, spotCheck: next, oneOnOnes }) }}
                aria-pressed={spotCheck}
                className={`${badgeCls} ${spotCheck ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
              >
                {spotCheck ? 'Yes' : 'No'}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            {savedMgr && <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
            <button type="button" onClick={saveManager} className={btnPrimary}>Save</button>
          </div>
        </div>
      )}
    </div>
  )
}

function RollupField({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-medium" title="Rolled up from Daily Activity">
        <Lock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
        {value}
      </div>
    </div>
  )
}
