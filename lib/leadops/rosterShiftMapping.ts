/**
 * leadOps Time & Motion — maps a REAL resolved roster day (from
 * lib/roster/resolveShift.ts) onto leadOps' EARLY/LATE shift-template
 * concept. Pure, no I/O — kept separate from rosterShiftAction.ts (the one
 * file that actually queries the roster tables) so the branching logic
 * itself is unit-testable without a database.
 *
 * This is the mechanism behind "the system should read the team leader's
 * roster and determine if they are 08:00–17:00 or 11:00–20:00" — it does
 * not invent a new roster concept, it reads the same ResolvedDaySlot every
 * other roster-aware feature in opsHub already produces (see
 * lib/roster/scheduleAlerts.ts's getAgentsOffOnDate for the closest
 * existing analogue: same resolveShift() call, same slot shape, different
 * question asked of it).
 */

import { TEMPLATE_EARLY_ID, TEMPLATE_LATE_ID } from './constants'
import type { ResolvedDaySlot } from '@/types'

export type ResolvedTlShift =
  | { kind: 'early'; startTime: string; endTime: string }
  | { kind: 'late'; startTime: string; endTime: string }
  | { kind: 'off' }
  /** No team_members row, no personal pattern, or a team on the older manual weekly-assignment path with nothing assigned this week — genuinely nothing to resolve from, not an error. */
  | { kind: 'unknown' }

/**
 * `slot.effectiveStatus === 'off'` takes priority over the shift template
 * even when one is present (resolveShift still reports the day's WOULD-BE
 * template alongside an 'off' override/attendance record) — Time & Motion
 * only cares whether there is a shift to log against today, not what it
 * would have been.
 */
export function mapResolvedSlotToTlShift(slot: ResolvedDaySlot): ResolvedTlShift {
  if (slot.effectiveStatus === 'off' || !slot.isWorkDay) return { kind: 'off' }
  if (!slot.shiftTemplate) return { kind: 'unknown' }

  const { start_time, end_time, is_late_shift } = slot.shiftTemplate
  return is_late_shift
    ? { kind: 'late', startTime: start_time, endTime: end_time }
    : { kind: 'early', startTime: start_time, endTime: end_time }
}

/**
 * The leadOps shift-template id (and its 11/10 SHIFT_TEMPLATE_BLOCKS) a
 * resolved roster shift maps onto — 'off'/'unknown'/not-yet-resolved all
 * mean there is no template to plan against yet.
 */
export function templateIdForResolvedShift(shift: ResolvedTlShift | null): string | null {
  if (shift?.kind === 'early') return TEMPLATE_EARLY_ID
  if (shift?.kind === 'late') return TEMPLATE_LATE_ID
  return null
}
