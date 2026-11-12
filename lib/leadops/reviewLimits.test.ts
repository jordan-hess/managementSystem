import {
  MAX_REVIEW_ACTIONS, MAX_REVIEW_COMMENT, MAX_REVIEW_NOTES, MAX_REVIEW_REASON, REVIEW_MESSAGES as M,
  canTransition, isMonthFinished, monthName, nextMonthStart, reviewMonthsWindow, reviewNotice, reviewPeriodProblem,
  validateComment, validateReason, validateReviewText,
} from './reviewLimits'

const TODAY = '2026-10-10'

describe('canTransition', () => {
  it.each([
    [null, 'draft'], ['draft', 'shared'], ['shared', 'draft'], ['shared', 'acknowledged'], ['acknowledged', 'draft'],
  ] as const)('allows %s -> %s', (from, to) => expect(canTransition(from, to)).toBe(true))

  it.each([
    [null, 'shared'], [null, 'acknowledged'], ['draft', 'acknowledged'], ['draft', 'draft'], ['shared', 'shared'],
    ['acknowledged', 'shared'], ['acknowledged', 'acknowledged'],
  ] as const)('refuses %s -> %s', (from, to) => expect(canTransition(from, to)).toBe(false))
})

describe('reviewPeriodProblem', () => {
  it('accepts the current month and the 11 before it (12 in all)', () => {
    expect(reviewMonthsWindow(TODAY)).toHaveLength(12)
    expect(reviewMonthsWindow(TODAY)[0]).toBe('2026-10-01')
    expect(reviewMonthsWindow(TODAY)[11]).toBe('2025-11-01')
    for (const m of reviewMonthsWindow(TODAY)) expect(reviewPeriodProblem(m, TODAY)).toBeNull()
  })
  it('refuses a mid-month date, a malformed value and a non-string as Invalid month.', () => {
    expect(reviewPeriodProblem('2026-10-15', TODAY)).toBe(M.invalidMonth)
    expect(reviewPeriodProblem('nope', TODAY)).toBe(M.invalidMonth)
    expect(reviewPeriodProblem(20261001, TODAY)).toBe(M.invalidMonth)
    expect(reviewPeriodProblem(null, TODAY)).toBe(M.invalidMonth)
  })
  it('refuses a future month and a month older than 12 months', () => {
    expect(reviewPeriodProblem('2026-11-01', TODAY)).toBe(M.outsideWindow)
    expect(reviewPeriodProblem('2025-10-01', TODAY)).toBe(M.outsideWindow)
  })
})

describe('month helpers', () => {
  it('nextMonthStart rolls the year', () => {
    expect(nextMonthStart('2026-10-01')).toBe('2026-11-01')
    expect(nextMonthStart('2026-12-01')).toBe('2027-01-01')
  })
  it('monthName gives the English month name', () => {
    expect(monthName('2026-10-01')).toBe('October')
    expect(monthName('2026-01-01')).toBe('January')
  })
  it('a month is finished only once the next month has started', () => {
    expect(isMonthFinished('2026-10-01', '2026-10-31')).toBe(false)
    expect(isMonthFinished('2026-10-01', '2026-11-01')).toBe(true)
    expect(isMonthFinished('2026-09-01', TODAY)).toBe(true)
  })
})

describe('text validation', () => {
  it('accepts the limits themselves and empty/absent text', () => {
    expect(validateReviewText({ notes: 'x'.repeat(MAX_REVIEW_NOTES), agreedActions: 'y'.repeat(MAX_REVIEW_ACTIONS) })).toBeNull()
    expect(validateReviewText({ notes: '', agreedActions: null })).toBeNull()
  })
  it('refuses over-length notes and agreed actions with their own messages', () => {
    expect(validateReviewText({ notes: 'x'.repeat(MAX_REVIEW_NOTES + 1), agreedActions: '' })).toBe(M.notesTooLong)
    expect(validateReviewText({ notes: '', agreedActions: 'y'.repeat(MAX_REVIEW_ACTIONS + 1) })).toBe(M.actionsTooLong)
  })
  it('refuses non-string text', () => {
    expect(validateReviewText({ notes: 5, agreedActions: '' })).toBe(M.notesTooLong)
    expect(validateReviewText({ notes: '', agreedActions: {} })).toBe(M.actionsTooLong)
  })
  it('a reason is required, non-blank and capped', () => {
    expect(validateReason('Typo in the agreed actions')).toBeNull()
    expect(validateReason('')).toBe(M.reasonRequired)
    expect(validateReason('   ')).toBe(M.reasonRequired)
    expect(validateReason(undefined)).toBe(M.reasonRequired)
    expect(validateReason('x'.repeat(MAX_REVIEW_REASON + 1))).toBe(M.reasonTooLong)
  })
  it('a comment is optional and capped', () => {
    expect(validateComment(undefined)).toBeNull()
    expect(validateComment('')).toBeNull()
    expect(validateComment('Thanks')).toBeNull()
    expect(validateComment('x'.repeat(MAX_REVIEW_COMMENT))).toBeNull()
    expect(validateComment('x'.repeat(MAX_REVIEW_COMMENT + 1))).toBe(M.commentTooLong)
    expect(validateComment(42)).toBe(M.commentTooLong)
  })
})

describe('reviewNotice — names the month and where to look, never review content', () => {
  it('shared', () => {
    expect(reviewNotice('shared', '2026-10-01')).toEqual({
      title: 'Performance review ready',
      message: 'Your October review is ready — open My Performance Review.',
    })
  })
  it('acknowledged names the person', () => {
    expect(reviewNotice('acknowledged', '2026-10-01', 'Taylor')).toEqual({
      title: 'Review acknowledged',
      message: 'Taylor has acknowledged their October review.',
    })
  })
  it('reopened for the team leader and for the reviewer', () => {
    expect(reviewNotice('reopened_tl', '2026-10-01').message).toBe('Your October review is being revised — it will be shared again.')
    expect(reviewNotice('reopened_reviewer', '2026-10-01', 'Taylor').message).toBe("Taylor's October review has been reopened.")
  })
  it('being revised (an edit unshared it)', () => {
    expect(reviewNotice('being_revised', '2026-10-01').message).toBe('Your October review is being revised.')
  })
})
