import { missingCriticals, type ItemInput, type QaLegs } from '@/lib/qa/scorecard'
import type { Department } from '@/lib/departments'

// Field keys: 'agent', 'legs', 'department', `item_<code>_<leg>` (an unanswered critical leg),
// `flag_notes_<typeId>` — item codes and flag ids are dynamic, so the map is keyed by plain strings.
export type ReviewFieldErrors = Record<string, string>

export interface ReviewValidationInput {
  agentId: string
  interactionDate: string
  legs: QaLegs | null
  department: Department | null
  items: ItemInput[]
  coachingFlags: Record<string, { checked: boolean; notes: string }>
}

export const CRITICAL_UNANSWERED = 'Answer this critical item: Yes, No or N/A.'

/** B and Q rows may be blank; C1–C3 must be answered on every leg that happened. No N/A reason is required. */
export function validateReview(v: ReviewValidationInput): ReviewFieldErrors {
  const e: ReviewFieldErrors = {}
  if (!v.agentId) e.agent = 'Please select an agent.'
  if (!v.interactionDate) e.interactionDate = 'Please enter the interaction date.'
  if (!v.legs) e.legs = 'Please choose the legs on this case.'
  if (!v.department) e.department = 'Please select a department.'

  // Without legs there's no way to know which legs happened; the legs error covers it.
  if (v.legs) {
    for (const { code, leg } of missingCriticals(v.items, v.legs)) e[`item_${code}_${leg}`] = CRITICAL_UNANSWERED
  }

  for (const [typeId, f] of Object.entries(v.coachingFlags)) {
    if (f.checked && !f.notes.trim()) e[`flag_notes_${typeId}`] = 'Notes are required for a root cause.'
  }
  return e
}
