// The one set of Time & Motion rules, shared by the form (so a problem shows before saving), the
// server action (the authority) and mirrored as CHECK constraints in
// Database/migrations/leadops-time-motion-2026-10-09.sql. Pure: no I/O, safe in client components.
// Spec: docs/superpowers/specs/2026-10-09-leadops-time-motion-design.md section 1.

import { PLANNER_CATEGORIES } from './constants'
import type { PlannerCategory } from './types'

export const MAX_PLANNER_MINUTES = 1440
export const MAX_REASON = 1000
export const MAX_ACTIVITY = 200
/** Unplanned entries per day. Each one is a row written inside the day's locking transaction, so the count is bounded. */
export const MAX_UNPLANNED = 50

export const PLANNER_MESSAGES = {
  invalidStatus: 'Invalid status.',
  invalidCategory: 'Invalid category.',
  invalidMinutes: 'Invalid minutes.',
  reasonRequired: 'A reason is required.',
  textTooLong: 'Text is too long.',
  invalidBlock: 'Invalid block.',
  duplicateBlock: 'Duplicate block.',
  notCompletedFields: 'Not completed blocks cannot have minutes, a category or an activity.',
  windowClosed: 'Planner days can only be changed on the day, or until 12:00 the next day.',
  notStarted: 'That day has not started yet.',
  noShift: 'No shift is rostered for this day — only unplanned work can be recorded.',
  rosterChanged: 'The roster for this day changed after entries were saved, so it cannot be edited here. Ask an administrator to correct it.',
  conflict: 'This planner day was changed elsewhere since you opened it. Reload to see the latest version.',
  saveFailed: 'Could not save planner day.',
  loadFailed: 'Could not load planner data.',
  invalidRevision: 'Invalid revision.',
  invalidTeamLeader: 'Invalid team leader.',
  tooManyUnplanned: 'Too many unplanned entries.',
} as const

export type StoredBlockStatus = 'completed' | 'moved' | 'not_completed'

export interface PlannerBlockInput {
  template_block_id: string
  status: StoredBlockStatus
  actual_minutes: number | null
  actual_category: PlannerCategory | null
  actual_activity: string | null
  reason: string | null
}

export interface PlannerUnplannedInput {
  category: PlannerCategory
  minutes: number
  reason: string
  displaced_block_id: string | null
}

export interface PlannerDayInput {
  blocks: PlannerBlockInput[]
  unplanned: PlannerUnplannedInput[]
}

const M = PLANNER_MESSAGES

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isMinutes = (v: unknown, min: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= MAX_PLANNER_MINUTES
const isCategory = (v: unknown): v is PlannerCategory => typeof v === 'string' && (PLANNER_CATEGORIES as string[]).includes(v)
const isBlank = (v: unknown): boolean => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** null/undefined/string within the limit are fine; a non-string is a malformed row; too long is too long. */
function textProblem(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return M.invalidBlock
  return v.length > max ? M.textTooLong : null
}

/** One block row, ignoring whether its id belongs to the shift (see validatePlannerDay). */
export function validateBlockInput(raw: unknown): string | null {
  if (!isRecord(raw)) return M.invalidBlock
  const { status, actual_minutes, actual_category, actual_activity, reason } = raw
  if (status !== 'completed' && status !== 'moved' && status !== 'not_completed') return M.invalidStatus
  const text = textProblem(actual_activity, MAX_ACTIVITY) ?? textProblem(reason, MAX_REASON)
  if (text) return text

  if (status === 'not_completed') {
    if (actual_minutes != null || actual_category != null || !isBlank(actual_activity)) return M.notCompletedFields
    return isBlank(reason) ? M.reasonRequired : null
  }
  if (!isMinutes(actual_minutes, 1)) return M.invalidMinutes
  if (!isCategory(actual_category)) return M.invalidCategory
  if (status === 'moved' && isBlank(reason)) return M.reasonRequired
  return null
}

/** An unplanned entry; `displaced_block_id`, if set, must be one of the day's block ids. */
export function validateUnplannedInput(raw: unknown, allowedBlockIds: string[]): string | null {
  if (!isRecord(raw)) return M.invalidBlock
  const { category, minutes, reason, displaced_block_id } = raw
  if (!isCategory(category)) return M.invalidCategory
  if (!isMinutes(minutes, 1)) return M.invalidMinutes
  if (isBlank(reason)) return M.reasonRequired
  const text = textProblem(reason, MAX_REASON)
  if (text) return text
  if (displaced_block_id !== null && displaced_block_id !== undefined && displaced_block_id !== '') {
    if (typeof displaced_block_id !== 'string' || !allowedBlockIds.includes(displaced_block_id)) return M.invalidBlock
  }
  return null
}

/** A whole day: every block must belong to the shift, appear once, and satisfy its status rules. */
export function validatePlannerDay(raw: unknown, allowedBlockIds: string[]): string | null {
  if (!isRecord(raw) || !Array.isArray(raw.blocks) || !Array.isArray(raw.unplanned)) return M.invalidBlock
  if (raw.unplanned.length > MAX_UNPLANNED) return M.tooManyUnplanned
  const seen = new Set<string>()
  for (const block of raw.blocks) {
    if (!isRecord(block) || typeof block.template_block_id !== 'string' || !allowedBlockIds.includes(block.template_block_id)) {
      return M.invalidBlock
    }
    if (seen.has(block.template_block_id)) return M.duplicateBlock
    seen.add(block.template_block_id)
    const problem = validateBlockInput(block)
    if (problem) return problem
  }
  for (const entry of raw.unplanned) {
    const problem = validateUnplannedInput(entry, allowedBlockIds)
    if (problem) return problem
  }
  return null
}

// A forged request may leave optional keys out entirely: undefined is treated like null, never `.trim()`med.
const trimmed = (v: string | null | undefined): string | null => (v == null || v.trim() === '' ? null : v.trim())

/**
 * Call only on a day that passed validatePlannerDay. Builds every row field by field, so a key the client left
 * out becomes an explicit null (and any extra key it added is dropped) before anything reaches the database.
 */
export function normalizePlannerDay(day: PlannerDayInput): PlannerDayInput {
  return {
    blocks: day.blocks.map((b) => ({
      template_block_id: b.template_block_id,
      status: b.status,
      actual_minutes: b.actual_minutes ?? null,
      actual_category: b.actual_category ?? null,
      actual_activity: trimmed(b.actual_activity),
      reason: trimmed(b.reason),
    })),
    unplanned: day.unplanned.map((u) => ({
      category: u.category,
      minutes: u.minutes,
      reason: u.reason.trim(),
      displaced_block_id: u.displaced_block_id || null,
    })),
  }
}
