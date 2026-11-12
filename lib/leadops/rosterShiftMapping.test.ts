import { TEMPLATE_EARLY_ID, TEMPLATE_LATE_ID } from './constants'
import { mapResolvedSlotToTlShift, templateIdForResolvedShift } from './rosterShiftMapping'
import type { ResolvedDaySlot } from '@/types'

function slot(overrides: Partial<ResolvedDaySlot> = {}): ResolvedDaySlot {
  return {
    profileId: 'p1',
    date: '2026-09-22',
    isWorkDay: true,
    shiftTemplate: { id: 'auto-early', name: 'Early', start_time: '08:00:00', end_time: '17:00:00', work_days: [1, 2, 3, 4, 5, 6, 7], description: null, is_late_shift: false, created_at: '', updated_at: '' },
    overrideType: null,
    attendanceStatus: null,
    effectiveStatus: 'on_shift',
    ...overrides,
  }
}

describe('mapResolvedSlotToTlShift', () => {
  it('maps a non-late template to early, 08:00–17:00', () => {
    expect(mapResolvedSlotToTlShift(slot())).toEqual({ kind: 'early', startTime: '08:00:00', endTime: '17:00:00' })
  })

  it('maps an is_late_shift template to late, 11:00–20:00', () => {
    const late = slot({
      shiftTemplate: { id: 'auto-late', name: 'Late', start_time: '11:00:00', end_time: '20:00:00', work_days: [1, 2, 3, 4, 5, 6, 7], description: null, is_late_shift: true, created_at: '', updated_at: '' },
    })
    expect(mapResolvedSlotToTlShift(late)).toEqual({ kind: 'late', startTime: '11:00:00', endTime: '20:00:00' })
  })

  it('maps effectiveStatus off to off, even though resolveShift still reports the day’s would-be template', () => {
    // resolveShift keeps shiftTemplate populated on an 'off' override/attendance
    // record (see resolveShift.ts's attendanceStatus and overrideType=='off'
    // branches) — Time & Motion only cares whether there's a shift to log
    // against today, not what it would have been.
    const off = slot({ isWorkDay: false, effectiveStatus: 'off', shiftTemplate: null })
    expect(mapResolvedSlotToTlShift(off)).toEqual({ kind: 'off' })

    const offWithTemplate = slot({ effectiveStatus: 'off' })
    expect(mapResolvedSlotToTlShift(offWithTemplate)).toEqual({ kind: 'off' })
  })

  it('maps isWorkDay=false to off even if effectiveStatus is not literally "off"', () => {
    // Defensive: a day resolveShift marks as not a work day should never
    // read as a loggable shift, regardless of the exact status string.
    const notWorking = slot({ isWorkDay: false, shiftTemplate: null })
    expect(mapResolvedSlotToTlShift(notWorking)).toEqual({ kind: 'off' })
  })

  it('maps no_rotation (no team, no personal pattern) to unknown', () => {
    const noRotation = slot({ effectiveStatus: 'no_rotation', shiftTemplate: null, isWorkDay: false })
    // isWorkDay is false here too (per resolveShift's own no_rotation branch),
    // so this actually resolves to 'off' by the isWorkDay guard above — the
    // genuinely-ambiguous 'unknown' case is a work day with no template.
    expect(mapResolvedSlotToTlShift(noRotation)).toEqual({ kind: 'off' })
  })

  it('maps a work day with no shift template at all to unknown', () => {
    const ambiguous = slot({ isWorkDay: true, effectiveStatus: 'on_shift', shiftTemplate: null })
    expect(mapResolvedSlotToTlShift(ambiguous)).toEqual({ kind: 'unknown' })
  })

  it('still resolves a shift on a day carrying an attendance override (sick/leave/absent)', () => {
    // Data Entry should still let a TL log what actually happened, so a
    // sick/leave/absent day that nonetheless has a planned template is not
    // treated as 'off' — only a genuine off day is.
    const sick = slot({ effectiveStatus: 'sick', attendanceStatus: 'sick' })
    expect(mapResolvedSlotToTlShift(sick)).toEqual({ kind: 'early', startTime: '08:00:00', endTime: '17:00:00' })
  })
})

describe('templateIdForResolvedShift', () => {
  it('maps early/late to the matching shift-template id', () => {
    expect(templateIdForResolvedShift({ kind: 'early', startTime: '08:00:00', endTime: '17:00:00' })).toBe(TEMPLATE_EARLY_ID)
    expect(templateIdForResolvedShift({ kind: 'late', startTime: '11:00:00', endTime: '20:00:00' })).toBe(TEMPLATE_LATE_ID)
  })

  it('maps off/unknown/null (not yet resolved) to no template', () => {
    expect(templateIdForResolvedShift({ kind: 'off' })).toBeNull()
    expect(templateIdForResolvedShift({ kind: 'unknown' })).toBeNull()
    expect(templateIdForResolvedShift(null)).toBeNull()
  })
})
