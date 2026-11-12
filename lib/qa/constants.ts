// Shared constants for the QA Scorecard UI.

import type { Department } from '@/lib/departments'
import type { RatingLabel } from '@/lib/qa/scorecard'

// Display labels for lib/departments.ts's DEPARTMENTS (Scorecard header
// field, list and overview filters). Values stay 'Social' | 'T2' | 'Billing'.
export const DEPARTMENT_LABELS: Record<Department, string> = {
  Social: 'Social Media',
  T2: 'T2 Support',
  Billing: 'Billing',
}

export const LEGS_LABELS: Record<'written' | 'call' | 'both', string> = {
  written: 'Written',
  call: 'Call',
  both: 'Both',
}

/** Outcome badge colours for the scorecard's rating labels — shared by the review list and the My QA card. */
export function outcomeBadgeCls(label: RatingLabel): string {
  if (label === 'Fail' || label === 'Fail (Critical)') return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
  if (label === 'Excellent') return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
  if (label === 'Good') return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
  return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
}
