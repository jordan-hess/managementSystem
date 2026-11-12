// The Performance Review rules shared by the server actions (the authority), the screens (so a problem shows
// before saving) and mirrored as CHECKs in Database/migrations/leadops-performance-reviews-2026-10-10.sql.
// Pure: no I/O, safe in client components. Spec: docs/superpowers/specs/2026-10-10-leadops-performance-reviews-design.md.

import { currentMonth, recentMonths } from './periods'

export const MAX_REVIEW_NOTES = 8000
export const MAX_REVIEW_ACTIONS = 4000
export const MAX_REVIEW_REASON = 1000
export const MAX_REVIEW_COMMENT = 1000

export const REVIEW_MESSAGES = {
  forbidden: 'Forbidden',
  invalidMonth: 'Invalid month.',
  outsideWindow: 'Reviews can only be written for the last 12 months, not future months.',
  invalidTeamLeader: 'Invalid team leader.',
  invalidRevision: 'Invalid revision.',
  notesTooLong: 'Notes are too long.',
  actionsTooLong: 'Agreed actions are too long.',
  commentTooLong: 'Comment is too long.',
  reasonRequired: 'A reason is required.',
  reasonTooLong: 'Reason is too long.',
  conflict: 'This review was changed elsewhere since you opened it. Reload to see the latest version.',
  confirmUnshare: 'Editing a shared review unshares it. Confirm to continue.',
  acknowledgedLocked: 'This review has been acknowledged and is locked. Ask the HOD to reopen it.',
  notShared: 'This review has not been shared.',
  staleShare: 'This review was updated while you were reading it — please read the new version.',
  illegalTransition: 'That change is not allowed for this review.',
  hodOnly: 'Only the HOD can reopen a review.',
  notFound: 'Review not found.',
  saveFailed: 'Could not save this review.',
  loadFailed: 'Could not load this review.',
} as const

export type ReviewStatus = 'draft' | 'shared' | 'acknowledged'

const LEGAL: ReadonlyArray<readonly [ReviewStatus | null, ReviewStatus]> = [
  [null, 'draft'],
  ['draft', 'shared'],
  ['shared', 'draft'],
  ['shared', 'acknowledged'],
  ['acknowledged', 'draft'],
]

/** The only legal status changes (mirrored by a CHECK on review_events). */
export function canTransition(from: ReviewStatus | null, to: ReviewStatus): boolean {
  return LEGAL.some(([f, t]) => f === from && t === to)
}

/** The twelve first-of-month dates a review may cover: the current month and the eleven before it, newest first. */
export function reviewMonthsWindow(todayIso: string): string[] {
  return recentMonths(todayIso, 12)
}

/** null when `period` is an acceptable review month; otherwise the message to show. */
export function reviewPeriodProblem(period: unknown, todayIso: string): string | null {
  if (typeof period !== 'string' || !/^\d{4}-\d{2}-01$/.test(period)) return REVIEW_MESSAGES.invalidMonth
  // A first-of-month string that is not a real month (e.g. 2026-13-01) is also invalid.
  const month = Number(period.slice(5, 7))
  if (month < 1 || month > 12) return REVIEW_MESSAGES.invalidMonth
  return reviewMonthsWindow(todayIso).includes(period) ? null : REVIEW_MESSAGES.outsideWindow
}

/** '2026-10-01' -> '2026-11-01' (rolls the year). */
export function nextMonthStart(period: string): string {
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(5, 7))
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** '2026-10-01' -> 'October'. */
export function monthName(period: string): string {
  return MONTH_NAMES[Number(period.slice(5, 7)) - 1] ?? period
}

/** A month is finished only once the next month has started (South African date passed in by the caller). */
export function isMonthFinished(period: string, todayIso: string): boolean {
  return todayIso >= nextMonthStart(period) || currentMonth(todayIso) > period
}

const tooLong = (v: unknown, max: number): boolean => v !== null && v !== undefined && (typeof v !== 'string' || v.length > max)

export function validateReviewText(input: { notes: unknown; agreedActions: unknown }): string | null {
  if (tooLong(input.notes, MAX_REVIEW_NOTES)) return REVIEW_MESSAGES.notesTooLong
  if (tooLong(input.agreedActions, MAX_REVIEW_ACTIONS)) return REVIEW_MESSAGES.actionsTooLong
  return null
}

export function validateReason(reason: unknown): string | null {
  if (typeof reason !== 'string' || reason.trim() === '') return REVIEW_MESSAGES.reasonRequired
  return reason.length > MAX_REVIEW_REASON ? REVIEW_MESSAGES.reasonTooLong : null
}

export function validateComment(note: unknown): string | null {
  return tooLong(note, MAX_REVIEW_COMMENT) ? REVIEW_MESSAGES.commentTooLong : null
}

export type ReviewNoticeKind = 'shared' | 'acknowledged' | 'reopened_tl' | 'reopened_reviewer' | 'being_revised'

/**
 * Notification text. It names the month and where to look and contains NO review content (no notes, actions,
 * figures or the team leader's comment): the notifications table is read by the bell for anyone it is addressed to.
 */
export function reviewNotice(kind: ReviewNoticeKind, period: string, personName?: string): { title: string; message: string } {
  const month = monthName(period)
  switch (kind) {
    case 'shared':
      return { title: 'Performance review ready', message: `Your ${month} review is ready — open My Performance Review.` }
    case 'acknowledged':
      return { title: 'Review acknowledged', message: `${personName ?? 'The team leader'} has acknowledged their ${month} review.` }
    case 'reopened_tl':
      return { title: 'Performance review being revised', message: `Your ${month} review is being revised — it will be shared again.` }
    case 'reopened_reviewer':
      return { title: 'Review reopened', message: `${personName ?? 'The team leader'}'s ${month} review has been reopened.` }
    case 'being_revised':
      return { title: 'Performance review being revised', message: `Your ${month} review is being revised.` }
  }
}
