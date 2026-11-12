/**
 * leadOps Time & Motion Planner — pure math, no I/O.
 *
 * Implements the two deliberately separate, overlapping computations from
 * the integration plan:
 *
 *  1. Category totals — sums to the day's ACTUAL worked time. `completed`
 *     blocks count under the template's category, `moved` blocks under the
 *     re-tagged `actual_category`, `not_completed` blocks count for nothing,
 *     and unplanned entries carry their own category. There is no forced
 *     reconciliation to a fixed day length in either direction — a short or
 *     long day shows honestly.
 *  2. Unplanned/moved diagnostic — every `moved` block's minutes plus every
 *     unplanned entry's minutes. This OVERLAPS #1 by design; it answers "how
 *     much of today held up as planned?", not "what bucket did time land in?"
 *
 * Time arithmetic is hand-rolled over 'HH:MM' strings, matching the existing
 * idiom in lib/roster/presence.ts and lib/agentStatus/actions.ts (date-fns is
 * used only for display formatting elsewhere in the repo).
 */

import { PLANNER_CATEGORIES } from './constants'
import type {
  CategoryTotal,
  PlannerBlockLog,
  PlannerCategory,
  PlannerDaySummary,
  PlannerReason,
  PlannerUnplannedEntry,
  ShiftTemplateBlock,
} from './types'

/** 'HH:MM' or 'HH:MM:SS' -> minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export function minutesBetween(start: string, end: string): number {
  return timeToMinutes(end) - timeToMinutes(start)
}

/** 210 -> '3h30m', 60 -> '1h', 45 -> '45m', 0 -> '0m'. */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h${m}m`
}

/** The block's planned duration, straight off the template. */
export function blockMinutes(block: ShiftTemplateBlock): number {
  return minutesBetween(block.start_time, block.end_time)
}

/**
 * The category a block should be REPORTED under: the TL-entered
 * `actual_category` when set, else the template's own — for both
 * `completed` and `moved` blocks. Every block's category is now TL-entered
 * rather than fixed (the template's category is a placeholder/default, not
 * an immutable label — see the Time & Motion rework), so 'completed' honors
 * an override the same way 'moved' always has. Null when the block
 * contributes nothing (`planned` or `not_completed`).
 */
export function effectiveCategory(
  log: PlannerBlockLog | undefined,
  block: ShiftTemplateBlock,
): PlannerCategory | null {
  if (!log || log.status === 'planned' || log.status === 'not_completed') return null
  return log.actual_category ?? block.category
}

/**
 * The activity a block should be REPORTED under: the TL-entered free text
 * when set, else the template's own activity name as a placeholder/default.
 * Mirrors effectiveCategory's fallback shape.
 */
export function effectiveActivity(
  log: PlannerBlockLog | undefined,
  block: ShiftTemplateBlock,
): string {
  return log?.actual_activity?.trim() || block.activity
}

/**
 * The minutes a block contributes to the day's actual worked time. A
 * `moved` block may have run long or short, so `actual_minutes` wins when
 * set; otherwise the planned duration stands in.
 */
export function effectiveMinutes(
  log: PlannerBlockLog | undefined,
  block: ShiftTemplateBlock,
): number {
  if (!log || log.status === 'planned' || log.status === 'not_completed') return 0
  return log.actual_minutes ?? blockMinutes(block)
}

/**
 * Total planned time for the day, from the template alone — the full
 * rostered 9h, lunch included.
 */
export function plannedMinutes(blocks: ShiftTemplateBlock[]): number {
  return blocks.reduce((sum, b) => sum + blockMinutes(b), 0)
}

/**
 * Planned lunch. Both templates roster a 9h day as 8h of work plus a 1h
 * break; the break is recorded rather than dropped, so the two are reported
 * separately instead of collapsing into one figure.
 */
export function plannedBreakMinutes(blocks: ShiftTemplateBlock[]): number {
  return blocks.filter((b) => b.category === 'break').reduce((sum, b) => sum + blockMinutes(b), 0)
}

/**
 * Computation #1 — grouped by reported category, in PLANNER_CATEGORIES
 * order. Categories with no time are omitted. Sums to the day's actual
 * worked time.
 */
export function categoryTotals(
  blocks: ShiftTemplateBlock[],
  logs: PlannerBlockLog[],
  unplanned: PlannerUnplannedEntry[],
): CategoryTotal[] {
  const byCategory = new Map<PlannerCategory, number>()

  for (const block of blocks) {
    const log = logs.find((l) => l.template_block_id === block.id)
    const category = effectiveCategory(log, block)
    if (!category) continue
    byCategory.set(category, (byCategory.get(category) ?? 0) + effectiveMinutes(log, block))
  }

  for (const entry of unplanned) {
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.minutes)
  }

  return PLANNER_CATEGORIES.filter((c) => (byCategory.get(c) ?? 0) > 0).map((category) => ({
    category,
    minutes: byCategory.get(category) as number,
  }))
}

/**
 * Computation #2 — the diagnostic footnote. Moved blocks plus unplanned
 * entries. Overlaps categoryTotals by design; `not_completed` is excluded
 * because it represents work that didn't happen at all.
 */
export function unplannedDiagnostic(
  blocks: ShiftTemplateBlock[],
  logs: PlannerBlockLog[],
  unplanned: PlannerUnplannedEntry[],
): number {
  const movedMinutes = blocks.reduce((sum, block) => {
    const log = logs.find((l) => l.template_block_id === block.id)
    return log?.status === 'moved' ? sum + effectiveMinutes(log, block) : sum
  }, 0)
  return movedMinutes + unplanned.reduce((sum, e) => sum + e.minutes, 0)
}

/**
 * Every captured reason, for the "view reasons" expansion.
 *
 * Note `not_completed` rows are included even though they sit OUTSIDE the
 * diagnostic total — the plan requires a reason on them so missed work never
 * reads as unexplained. Their `minutes` is the planned duration that was
 * lost (they contribute zero to the day's actual time).
 */
export function collectReasons(
  blocks: ShiftTemplateBlock[],
  logs: PlannerBlockLog[],
  unplanned: PlannerUnplannedEntry[],
): PlannerReason[] {
  const reasons: PlannerReason[] = []

  for (const block of blocks) {
    const log = logs.find((l) => l.template_block_id === block.id)
    if (!log) continue
    if (log.status === 'moved') {
      reasons.push({
        kind: 'moved',
        label: effectiveActivity(log, block),
        minutes: effectiveMinutes(log, block),
        reason: log.reason ?? '',
      })
    } else if (log.status === 'not_completed') {
      reasons.push({
        kind: 'not_completed',
        label: effectiveActivity(log, block),
        minutes: blockMinutes(block),
        reason: log.reason ?? '',
      })
    }
  }

  for (const entry of unplanned) {
    reasons.push({
      kind: 'unplanned',
      label: entry.reason,
      minutes: entry.minutes,
      reason: entry.reason,
    })
  }

  return reasons
}

export function summariseDay(
  blocks: ShiftTemplateBlock[],
  logs: PlannerBlockLog[],
  unplanned: PlannerUnplannedEntry[],
): PlannerDaySummary {
  const totals = categoryTotals(blocks, logs, unplanned)
  const actual = totals.reduce((sum, t) => sum + t.minutes, 0)
  const actualBreak = totals.find((t) => t.category === 'break')?.minutes ?? 0
  const planned = plannedMinutes(blocks)
  const plannedBreak = plannedBreakMinutes(blocks)

  return {
    plannedMinutes: planned,
    plannedWorkMinutes: planned - plannedBreak,
    plannedBreakMinutes: plannedBreak,
    actualMinutes: actual,
    actualWorkMinutes: actual - actualBreak,
    actualBreakMinutes: actualBreak,
    categoryTotals: totals,
    unplannedOrMovedMinutes: unplannedDiagnostic(blocks, logs, unplanned),
    reasons: collectReasons(blocks, logs, unplanned),
  }
}

/**
 * Feeds the "% Time on Coaching & Support activities" KPI.
 *
 * Confirmed definition (2026-09-23): "share of the working week spent on
 * Coaching & People Development, Quality & Operations and Floor Support &
 * Ad-hoc activities, per the Time & Motion Planner." Those are the legacy
 * category names; the plan's Section 8.4 mapping takes them to Coaching, QA
 * and Operations respectively. Escalations is deliberately excluded — 8.4
 * splits it out as a new category of its own rather than folding it into
 * Floor Support & Ad-hoc.
 *
 * "Working week" is why the denominator is WORK time rather than the whole
 * rostered day: the roster is 8h of work plus a 1h lunch, and dividing by
 * the 9h would understate every activity percentage by about a ninth.
 */
export const COACHING_SUPPORT_CATEGORIES: PlannerCategory[] = ['coaching', 'qa', 'operations']

export function coachingSupportPercentage(summary: PlannerDaySummary): number {
  if (summary.actualWorkMinutes === 0) return 0
  const inScope = summary.categoryTotals
    .filter((t) => COACHING_SUPPORT_CATEGORIES.includes(t.category))
    .reduce((sum, t) => sum + t.minutes, 0)
  return Math.round((inScope / summary.actualWorkMinutes) * 100)
}

/**
 * Feeds the "Planner Adherence (variance to plan)" KPI — the share of the
 * planned working day that didn't hold up, as a percentage. Lower is better.
 *
 * Divides by planned WORK time, not the full rostered day: lunch stays out
 * of every denominator (confirmed 2026-09-23), so the 1h break is excluded
 * here exactly as it is in coachingSupportPercentage. Including it would
 * flatter the figure, since an hour nobody plans to work against can't
 * meaningfully absorb variance.
 */
export function plannerVariancePercentage(summary: PlannerDaySummary): number {
  if (summary.plannedWorkMinutes === 0) return 0
  return Math.round((summary.unplannedOrMovedMinutes / summary.plannedWorkMinutes) * 100)
}
