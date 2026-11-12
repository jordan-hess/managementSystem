import {
  DRAFT_MAX_AGE_MS, clearDraft, draftKey, loadDraft, pastDailyDraftDates, pruneExpiredDrafts, saveDraft,
} from './activityDrafts'

const NOW = Date.UTC(2026, 9, 8, 10, 0, 0)
const KEY = draftKey('daily', 'tl-1', '2026-10-08')

beforeEach(() => localStorage.clear())
afterEach(() => jest.restoreAllMocks())

describe('draftKey', () => {
  it('is namespaced by kind, owner and period', () => {
    expect(KEY).toBe('opshub:activityDraft:daily:tl-1:2026-10-08')
    expect(draftKey('weekly', 'tl-1', '2026-10-05')).toBe('opshub:activityDraft:weekly:tl-1:2026-10-05')
    expect(draftKey('manager', 'mgr-1', '2026-10-05')).toBe('opshub:activityDraft:manager:mgr-1:2026-10-05')
  })

  it('has a review kind, keyed per team leader and month', () => {
    expect(draftKey('review', 'tl-1', '2026-10-01')).toBe('opshub:activityDraft:review:tl-1:2026-10-01')
  })

  it('has a planner kind, keyed per team leader and day', () => {
    expect(draftKey('planner', 'tl-1', '2026-10-08')).toBe('opshub:activityDraft:planner:tl-1:2026-10-08')
  })
})

describe('save / load / clear', () => {
  it('round-trips the values', () => {
    saveDraft(KEY, { calls: '5', notes: 'hi' }, NOW)
    expect(loadDraft(KEY, NOW)).toEqual({ calls: '5', notes: 'hi' })
  })

  it('returns null when nothing is stored', () => {
    expect(loadDraft(KEY, NOW)).toBeNull()
  })

  it('clearDraft removes it', () => {
    saveDraft(KEY, { a: 1 }, NOW)
    clearDraft(KEY)
    expect(loadDraft(KEY, NOW)).toBeNull()
  })

  it('keeps a draft exactly 14 days old, and expires (and removes) one older than that', () => {
    saveDraft(KEY, { a: 1 }, NOW)
    expect(loadDraft(KEY, NOW + DRAFT_MAX_AGE_MS)).toEqual({ a: 1 })
    expect(loadDraft(KEY, NOW + DRAFT_MAX_AGE_MS + 1)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('treats corrupt or wrongly shaped storage as no draft, and removes it', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadDraft(KEY, NOW)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()

    localStorage.setItem(KEY, JSON.stringify({ values: { a: 1 } })) // no savedAt
    expect(loadDraft(KEY, NOW)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('when storage is blocked', () => {
  it('never throws and simply has no draft', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => saveDraft(KEY, { a: 1 })).not.toThrow()
    expect(loadDraft(KEY)).toBeNull()
    expect(() => clearDraft(KEY)).not.toThrow()
    expect(pastDailyDraftDates('tl-1', '2026-10-08')).toEqual([])
    expect(() => pruneExpiredDrafts()).not.toThrow()
  })
})

describe('pastDailyDraftDates', () => {
  it('lists earlier days with a live draft for this owner, newest first', () => {
    saveDraft(draftKey('daily', 'tl-1', '2026-10-05'), { a: 1 }, NOW)
    saveDraft(draftKey('daily', 'tl-1', '2026-10-07'), { a: 1 }, NOW)
    saveDraft(draftKey('daily', 'tl-1', '2026-10-08'), { a: 1 }, NOW) // today: not "past"
    saveDraft(draftKey('daily', 'tl-1', '2026-10-09'), { a: 1 }, NOW) // future: not "past"
    saveDraft(draftKey('daily', 'tl-2', '2026-10-06'), { a: 1 }, NOW) // someone else's
    saveDraft(draftKey('weekly', 'tl-1', '2026-10-06'), { a: 1 }, NOW) // not a daily draft
    expect(pastDailyDraftDates('tl-1', '2026-10-08', NOW)).toEqual(['2026-10-07', '2026-10-05'])
  })

  it('skips (and removes) expired drafts', () => {
    saveDraft(draftKey('daily', 'tl-1', '2026-09-01'), { a: 1 }, NOW - DRAFT_MAX_AGE_MS - 1)
    expect(pastDailyDraftDates('tl-1', '2026-10-08', NOW)).toEqual([])
    expect(localStorage.getItem(draftKey('daily', 'tl-1', '2026-09-01'))).toBeNull()
  })
})

describe('pruneExpiredDrafts', () => {
  it('removes expired and corrupt drafts only, and leaves every other key alone', () => {
    saveDraft(draftKey('daily', 'tl-1', '2026-09-01'), { a: 1 }, NOW - DRAFT_MAX_AGE_MS - 1)
    saveDraft(draftKey('daily', 'tl-1', '2026-10-08'), { a: 1 }, NOW)
    localStorage.setItem('opshub:activityDraft:daily:tl-1:2026-09-02', 'garbage')
    localStorage.setItem('opshub:lastSeen:announcements:u1', '123') // unrelated feature
    pruneExpiredDrafts(NOW)
    expect(localStorage.getItem(draftKey('daily', 'tl-1', '2026-09-01'))).toBeNull()
    expect(localStorage.getItem('opshub:activityDraft:daily:tl-1:2026-09-02')).toBeNull()
    expect(loadDraft(draftKey('daily', 'tl-1', '2026-10-08'), NOW)).toEqual({ a: 1 })
    expect(localStorage.getItem('opshub:lastSeen:announcements:u1')).toBe('123')
  })
})
