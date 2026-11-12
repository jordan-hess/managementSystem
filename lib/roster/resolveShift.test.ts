import { buildSlotMap } from './resolveShift'
import type { RosterOverride } from '@/types'

const pattern = { shiftSequence: ['EARLY'] as const, anchorDate: '2026-01-05' }
const personalPatterns = new Map([['p1', { ...pattern, shiftSequence: [...pattern.shiftSequence] }]])

function override(o: Partial<RosterOverride>): RosterOverride {
  return {
    id: 'o1', profile_id: 'p1', date: '2026-11-03', override_type: 'off', shift_template_id: null,
    override_shift: null, notes: null, created_by: 'u1', created_at: '', ...o,
  }
}

function slotsFor(overrides: RosterOverride[]) {
  return buildSlotMap([{ id: 'p1' }], [new Date(2026, 10, 3), new Date(2026, 10, 4)], [], [], [], overrides, undefined, personalPatterns)
}

describe('buildSlotMap override notes', () => {
  it('carries the override note onto that day only', () => {
    const map = slotsFor([override({ notes: 'Covering for Sam' })])
    expect(map.get('p1:2026-11-03')?.overrideNotes).toBe('Covering for Sam')
    expect(map.get('p1:2026-11-04')?.overrideNotes).toBeNull()
  })

  it('leaves the note null for an override without one', () => {
    expect(slotsFor([override({ notes: null })]).get('p1:2026-11-03')?.overrideNotes).toBeNull()
  })

  it("doesn't pick up another person's override note", () => {
    const map = slotsFor([override({ profile_id: 'p2', notes: 'Not yours' })])
    expect(map.get('p1:2026-11-03')?.overrideNotes).toBeNull()
  })
})
