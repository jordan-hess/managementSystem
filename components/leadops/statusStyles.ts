/**
 * leadOps status → class maps.
 *
 * Follows the repo's live badge idiom — an inline <span> with a class-map
 * lookup, the same shape as components/tickets/statusBadges.ts. (Note
 * components/ui/Badge.tsx is NOT used: it has no importers anywhere and no
 * dark: variants, so it renders light-on-light in dark mode.)
 *
 * Block statuses borrow the callback lifecycle palette, which maps onto them
 * almost 1:1 — pending/amber, completed/green, rescheduled/blue,
 * cancelled/red. Every status is paired with an icon so state is never
 * conveyed by colour alone, the convention stated in
 * lib/roster/attendanceColors.ts.
 */

import {
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  MoveRight,
  ShieldCheck,
  UserPen,
  type LucideIcon,
} from 'lucide-react'
import type {
  BlockStatus,
  ManagerRag,
  PlannerCategory,
  RatingValue,
  ScoreBand,
  VerificationStatus,
} from '@/lib/leadops/types'

export const badgeCls = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium'

export const BLOCK_STATUS_CLS: Record<BlockStatus, string> = {
  planned: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  completed: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  moved: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  not_completed: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
}

export const BLOCK_STATUS_ICON: Record<BlockStatus, LucideIcon> = {
  planned: CalendarClock,
  completed: CheckCircle2,
  moved: MoveRight,
  not_completed: CircleSlash,
}

export const VERIFICATION_CLS: Record<VerificationStatus, string> = {
  self_reported: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  verified: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  disputed: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
}

export const VERIFICATION_ICON: Record<VerificationStatus, LucideIcon> = {
  self_reported: UserPen,
  verified: ShieldCheck,
  disputed: CircleSlash,
}

export const BAND_CLS: Record<ScoreBand, string> = {
  green: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  red: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
}

/** Solid fills for the category breakdown bar and its legend dots. */
export const CATEGORY_BAR_CLS: Record<PlannerCategory, string> = {
  operations: 'bg-blue-500',
  coaching: 'bg-green-500',
  qa: 'bg-purple-500',
  team_management: 'bg-indigo-500',
  admin: 'bg-gray-400 dark:bg-gray-500',
  break: 'bg-amber-500',
  escalations: 'bg-orange-500',
}

export const CATEGORY_CHIP_CLS: Record<PlannerCategory, string> = {
  operations: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  coaching: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  qa: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
  team_management: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400',
  admin: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  break: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  escalations: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
}

/** Manager Scorecard's RAG — a 4th "no_data" state ScoreBand doesn't have, so it gets its own map rather than overloading BAND_CLS. */
export const MANAGER_RAG_CLS: Record<ManagerRag, string> = {
  green: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  red: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  no_data: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
}

export const MANAGER_RAG_LABELS: Record<ManagerRag, string> = {
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  no_data: 'No data',
}

/** The 1-3-plus-N/A rating control's exact labels, per the source spec's own wording. */
export const RATING_LABELS: Record<RatingValue, string> = {
  3: '3 - Meets Standard',
  2: '2 - Requires Work',
  1: '1 - Not Meeting Standard',
  NA: 'N/A - Not Applicable this cycle',
}

// Shared control classes — the "QA dialect" used by qa-reviews and the other
// management-facing pages (bg-gray-900 in dark, focus:border-blue-500).
export const inputCls =
  'w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark] disabled:bg-gray-50 dark:disabled:bg-gray-800/50 disabled:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none'
export const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1'
export const btnPrimary =
  'px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors'
export const btnSecondary =
  'px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors'
export const btnOutline =
  'px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
