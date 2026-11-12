'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Clock, Loader2 } from 'lucide-react'
import { animate } from 'animejs'
import { cardCls, mutedTextCls, sectionTitleCls, tableHeadCls } from '@/components/reports/theme'
import { BLOCK_STATUS_LABELS, CATEGORY_LABELS, SHIFT_TEMPLATE_BLOCKS, blocksForTemplate } from '@/lib/leadops/constants'
import {
  blockMinutes, effectiveActivity, effectiveCategory, effectiveMinutes, formatDuration, summariseDay,
} from '@/lib/leadops/plannerMath'
import { templateIdForResolvedShift } from '@/lib/leadops/rosterShiftMapping'
import { plannerDayFor, useLeadOpsData } from './LeadOpsDataProvider'
import type { BlockStatus, PlannerBlockLog, ShiftTemplateBlock } from '@/lib/leadops/types'
import { BLOCK_STATUS_CLS, BLOCK_STATUS_ICON, CATEGORY_BAR_CLS, CATEGORY_CHIP_CLS, badgeCls, labelCls } from './statusStyles'

/**
 * Time & Motion Planner — HOD's READ-ONLY view of what Data Entry captured.
 *
 * This tab used to own editing directly; it no longer does. Data Entry
 * (components/leadops/dataEntry/TimeMotionSection.tsx) is now the single
 * capture surface, per the "Data Entry owns capture, Planner becomes the
 * HOD's read-only view" decision — one place to enter, one place to review,
 * rather than two UIs that could drift apart.
 */
export default function PlannerTab() {
  const {
    teamLeaders, plannerLoading, plannerError, plannerRosterMismatch, plannerDays, selectedTlId, setSelectedTlId, selectedDate, setSelectedDate,
    resolvedShift, resolvedShiftLoading, resolvedShiftError,
  } = useLeadOpsData()
  const [showReasons, setShowReasons] = useState(false)

  const tlName = teamLeaders.find((t) => t.id === selectedTlId)?.full_name ?? selectedTlId
  const templateId = templateIdForResolvedShift(resolvedShift)
  const blocks = useMemo(() => (templateId ? blocksForTemplate(templateId) : []), [templateId])
  const day = plannerDayFor(plannerDays, selectedTlId, selectedDate)
  // After a roster change the saved blocks belong to another template: label them from the code's templates.
  const shownBlocks = useMemo(
    () => (plannerRosterMismatch ? SHIFT_TEMPLATE_BLOCKS.filter((b) => day.logs.some((l) => l.template_block_id === b.id)) : blocks),
    [plannerRosterMismatch, blocks, day.logs],
  )
  const summary = useMemo(() => summariseDay(shownBlocks, day.logs, day.unplanned), [shownBlocks, day.logs, day.unplanned])

  function logFor(blockId: string): PlannerBlockLog | undefined {
    return day.logs.find((l) => l.template_block_id === blockId)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls} htmlFor="planner-tl">Team leader</label>
          <select
            id="planner-tl"
            value={selectedTlId}
            onChange={(e) => setSelectedTlId(e.target.value)}
            className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]"
          >
            {teamLeaders.map((t) => <option key={t.id} value={t.id}>{t.full_name} — {t.team}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="planner-date">Date</label>
          <input
            id="planner-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]"
          />
        </div>
      </div>

      <ShiftBanner loading={resolvedShiftLoading} error={resolvedShiftError} shift={resolvedShift} tlName={tlName} date={selectedDate} />

      {plannerLoading && (
        <p className={`${mutedTextCls} flex items-center gap-2`}><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
      )}
      {!plannerLoading && plannerError && (
        <div className={`${cardCls} p-8 text-center`}><p className={mutedTextCls}>{plannerError}</p></div>
      )}
      {plannerRosterMismatch && !plannerLoading && !plannerError && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3" role="status">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            The roster for this day changed after entries were saved. The entries below were recorded against a different shift and cannot be edited here.
          </p>
        </div>
      )}

      {!plannerLoading && !plannerError && (
        <>
      <DaySummary summary={summary} showReasons={showReasons} onToggleReasons={() => setShowReasons((v) => !v)} />

      {shownBlocks.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className={sectionTitleCls}>Planned blocks</h2>
            <span className={mutedTextCls}>Read-only — entered by the team leader on Data Entry</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
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
                {shownBlocks.map((block) => <BlockRow key={block.id} block={block} log={logFor(block.id)} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className={sectionTitleCls}>Unplanned work</h2>
        </div>
        {day.unplanned.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No unplanned work logged for this day.</div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {day.unplanned.map((entry) => {
              // From every template in code, so a block displaced on the old shift still shows after a roster change.
              const displaced = SHIFT_TEMPLATE_BLOCKS.find((b) => b.id === entry.displaced_block_id)
              return (
                <div key={entry.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`${badgeCls} ${CATEGORY_CHIP_CLS[entry.category]}`}>{CATEGORY_LABELS[entry.category]}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{formatDuration(entry.minutes)}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{entry.reason}</p>
                  {displaced && <p className={`${mutedTextCls} mt-0.5`}>Displaced: {displaced.activity}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}

function BlockRow({ block, log }: { block: ShiftTemplateBlock; log: PlannerBlockLog | undefined }) {
  const status: BlockStatus = log?.status ?? 'planned'
  const Icon = BLOCK_STATUS_ICON[status]
  const counted = effectiveMinutes(log, block)
  const reportedCategory = effectiveCategory(log, block) ?? block.category
  const reportedActivity = effectiveActivity(log, block)

  return (
    <tr className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 align-top">
      <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{block.start_time.slice(0, 5)}–{block.end_time.slice(0, 5)}</td>
      <td className="px-4 py-2.5">
        <div className="text-gray-900 dark:text-white">{reportedActivity}</div>
        {log?.reason && <div className={`${mutedTextCls} mt-0.5 max-w-md`}>{log.reason}</div>}
      </td>
      <td className="px-4 py-2.5">
        <span className={`${badgeCls} ${CATEGORY_CHIP_CLS[reportedCategory]}`}>{CATEGORY_LABELS[reportedCategory]}</span>
        {reportedCategory !== block.category && <div className={`${mutedTextCls} mt-0.5`}>was {CATEGORY_LABELS[block.category]}</div>}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <span className={counted === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white font-medium'}>{formatDuration(counted)}</span>
        {counted !== blockMinutes(block) && <div className={mutedTextCls}>of {formatDuration(blockMinutes(block))}</div>}
      </td>
      <td className="px-4 py-2.5">
        <span className={`${badgeCls} ${BLOCK_STATUS_CLS[status]}`}><Icon className="w-3 h-3" />{BLOCK_STATUS_LABELS[status]}</span>
      </td>
    </tr>
  )
}

/** Mirrors dataEntry/TimeMotionSection.tsx's ShiftBanner — read-only view of the same roster-resolved shift. */
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
      {shift.startTime.slice(0, 5)}–{shift.endTime.slice(0, 5)} ({shift.kind === 'early' ? 'Early' : 'Late'} shift, from the roster)
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
        <p className="text-sm text-gray-500 dark:text-gray-400">Nothing logged for this team leader/date yet — see Data Entry.</p>
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
