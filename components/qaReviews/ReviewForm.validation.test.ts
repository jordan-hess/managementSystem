import { validateReview, type ReviewValidationInput } from './ReviewForm.validation'
import { SCORECARD_ITEMS, type ItemInput } from '@/lib/qa/scorecard'

/** Every item blank, then C1–C3 answered on both legs. */
function items(over: Partial<Record<string, Partial<ItemInput>>> = {}): ItemInput[] {
  return SCORECARD_ITEMS.map((d) => ({
    code: d.code,
    written: d.section === 'critical' ? 'yes' : null,
    call: d.section === 'critical' ? 'yes' : null,
    ...over[d.code],
  }))
}

function input(over: Partial<ReviewValidationInput> = {}): ReviewValidationInput {
  return { agentId: 'a1', interactionDate: '2026-10-01', legs: 'both', department: 'Social', items: items(), coachingFlags: {}, ...over }
}

describe('validateReview', () => {
  it('is empty for a complete review', () => {
    expect(validateReview(input())).toEqual({})
  })

  it('requires agent, legs, department', () => {
    const e = validateReview(input({ agentId: '', legs: null, department: null }))
    expect(Object.keys(e).sort()).toEqual(['agent', 'department', 'legs'])
    expect(e.agent).toBe('Please select an agent.')
  })

  it('requires the interaction date', () => {
    const e = validateReview(input({ interactionDate: '' }))
    expect(Object.keys(e)).toEqual(['interactionDate'])
  })

  it('requires C1–C3 on both legs when legs is both', () => {
    const e = validateReview(input({ items: items({ C1: { written: null, call: null }, C3: { call: null } }) }))
    expect(Object.keys(e)).toEqual(['item_C1_written', 'item_C1_call', 'item_C3_call'])
  })

  it('only checks the leg that happened on a single-leg case, and N/A counts as answered', () => {
    const e = validateReview(input({ legs: 'written', items: items({ C1: { call: null }, C2: { written: 'na', call: null }, C3: { written: null } }) }))
    expect(Object.keys(e)).toEqual(['item_C3_written'])
  })

  it('B/Q blanks allowed', () => {
    // items() leaves every B and Q leg blank.
    expect(validateReview(input())).toEqual({})
  })

  it('flag needs notes', () => {
    const e = validateReview(input({ coachingFlags: { f1: { checked: true, notes: '  ' }, f2: { checked: false, notes: '' }, f3: { checked: true, notes: 'ok' } } }))
    expect(e).toEqual({ flag_notes_f1: 'Notes are required for a root cause.' })
  })
})
