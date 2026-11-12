import { isPopupType, selectNewPopups } from './popup'
import type { Notification } from '@/types'

const n = (id: string, type: string, over: Partial<Notification> = {}) =>
  ({ id, type, read: false, created_at: '2030-01-01T10:00:00Z', title: id, message: '', ...over }) as unknown as Notification

describe('isPopupType', () => {
  it('is true only for callback, reminder, escalation and followup', () => {
    for (const t of ['callback', 'reminder', 'escalation', 'followup']) expect(isPopupType(t)).toBe(true)
    for (const t of ['request', 'info', 'queue_assignment', 'schedule_conflict', 'attendance_pattern']) expect(isPopupType(t)).toBe(false)
  })
})

describe('selectNewPopups', () => {
  it('stays silent on the first poll but remembers every id, including non-popup ones', () => {
    const r = selectNewPopups(null, [n('a', 'callback'), n('b', 'info')])
    expect(r.popups).toEqual([])
    expect([...r.seen].sort()).toEqual(['a', 'b'])
  })

  it('returns only new, unread, popup-type notifications on a later poll', () => {
    const seen = new Set(['a'])
    const r = selectNewPopups(seen, [n('a', 'callback'), n('b', 'reminder'), n('c', 'info'), n('d', 'escalation', { read: true })])
    expect(r.popups.map((p) => p.id)).toEqual(['b'])
  })

  it('never returns the same notification twice', () => {
    const first = selectNewPopups(new Set(), [n('b', 'callback')])
    expect(first.popups).toHaveLength(1)
    const second = selectNewPopups(first.seen, [n('b', 'callback')])
    expect(second.popups).toEqual([])
  })

  it('orders several new notifications oldest first', () => {
    const r = selectNewPopups(new Set(), [
      n('late', 'callback', { created_at: '2030-01-01T10:05:00Z' }),
      n('early', 'escalation', { created_at: '2030-01-01T10:01:00Z' }),
    ])
    expect(r.popups.map((p) => p.id)).toEqual(['early', 'late'])
  })

  it('does not mutate the seen set it was given', () => {
    const seen = new Set(['a'])
    selectNewPopups(seen, [n('b', 'callback')])
    expect([...seen]).toEqual(['a'])
  })
})
