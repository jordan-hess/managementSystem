import {
  MAX_UNPLANNED, PLANNER_MESSAGES as M, normalizePlannerDay, validateBlockInput, validatePlannerDay, validateUnplannedInput,
  type PlannerBlockInput,
} from './plannerLimits'

const IDS = ['tpl-early-b1', 'tpl-early-b2', 'tpl-early-b3']
const completed = (over: Partial<PlannerBlockInput> = {}): PlannerBlockInput => ({
  template_block_id: 'tpl-early-b1', status: 'completed', actual_minutes: 30, actual_category: 'team_management',
  actual_activity: null, reason: null, ...over,
})
const moved = (over: Partial<PlannerBlockInput> = {}): PlannerBlockInput => ({
  template_block_id: 'tpl-early-b2', status: 'moved', actual_minutes: 45, actual_category: 'operations',
  actual_activity: 'Covered the queue', reason: 'Queue spike', ...over,
})
const notCompleted = (over: Partial<PlannerBlockInput> = {}): PlannerBlockInput => ({
  template_block_id: 'tpl-early-b3', status: 'not_completed', actual_minutes: null, actual_category: null,
  actual_activity: null, reason: 'Called into a meeting', ...over,
})
const unplanned = (over = {}) => ({ category: 'operations' as const, minutes: 30, reason: 'Escalation', displaced_block_id: null, ...over })

describe('validateBlockInput — one row per status', () => {
  it('accepts a valid block of each status', () => {
    expect(validateBlockInput(completed())).toBeNull()
    expect(validateBlockInput(moved())).toBeNull()
    expect(validateBlockInput(notCompleted())).toBeNull()
  })

  it.each([
    ['unknown status', completed({ status: 'planned' as never }), M.invalidStatus],
    ['completed with 0 minutes', completed({ actual_minutes: 0 }), M.invalidMinutes],
    ['completed with 1441 minutes', completed({ actual_minutes: 1441 }), M.invalidMinutes],
    ['completed with fractional minutes', completed({ actual_minutes: 1.5 }), M.invalidMinutes],
    ['completed with no minutes', completed({ actual_minutes: null }), M.invalidMinutes],
    ['completed with no category', completed({ actual_category: null }), M.invalidCategory],
    ['completed with an unknown category', completed({ actual_category: 'lunch' as never }), M.invalidCategory],
    ['moved with no minutes', moved({ actual_minutes: null }), M.invalidMinutes],
    ['moved with no category', moved({ actual_category: null }), M.invalidCategory],
    ['moved with a blank reason', moved({ reason: '   ' }), M.reasonRequired],
    ['moved with no reason', moved({ reason: null }), M.reasonRequired],
    ['not completed with a blank reason', notCompleted({ reason: '' }), M.reasonRequired],
    ['not completed with minutes', notCompleted({ actual_minutes: 30 }), M.notCompletedFields],
    ['not completed with a category', notCompleted({ actual_category: 'qa' }), M.notCompletedFields],
    ['not completed with an activity', notCompleted({ actual_activity: 'Something' }), M.notCompletedFields],
    ['an activity over 200 characters', completed({ actual_activity: 'x'.repeat(201) }), M.textTooLong],
    ['a reason over 1000 characters', moved({ reason: 'x'.repeat(1001) }), M.textTooLong],
  ])('refuses %s', (_name, block, message) => {
    expect(validateBlockInput(block)).toBe(message)
  })

  it('accepts the limits themselves: 1 and 1440 minutes, 200-character activity, 1000-character reason', () => {
    expect(validateBlockInput(completed({ actual_minutes: 1 }))).toBeNull()
    expect(validateBlockInput(completed({ actual_minutes: 1440 }))).toBeNull()
    expect(validateBlockInput(completed({ actual_activity: 'x'.repeat(200) }))).toBeNull()
    expect(validateBlockInput(moved({ reason: 'x'.repeat(1000) }))).toBeNull()
  })

  it('allows an optional reason on a completed block', () => {
    expect(validateBlockInput(completed({ reason: 'Ran slightly over' }))).toBeNull()
  })

  it('refuses anything that is not an object', () => {
    expect(validateBlockInput(null)).toBe(M.invalidBlock)
    expect(validateBlockInput('x')).toBe(M.invalidBlock)
  })
})

describe('validateUnplannedInput', () => {
  it('accepts a valid entry, with or without a displaced block', () => {
    expect(validateUnplannedInput(unplanned(), IDS)).toBeNull()
    expect(validateUnplannedInput(unplanned({ displaced_block_id: 'tpl-early-b2' }), IDS)).toBeNull()
  })
  it.each([
    ['0 minutes', unplanned({ minutes: 0 }), M.invalidMinutes],
    ['1441 minutes', unplanned({ minutes: 1441 }), M.invalidMinutes],
    ['no category', unplanned({ category: 'nope' }), M.invalidCategory],
    ['a blank reason', unplanned({ reason: '  ' }), M.reasonRequired],
    ['a reason over 1000 characters', unplanned({ reason: 'x'.repeat(1001) }), M.textTooLong],
    ['a displaced block of another shift', unplanned({ displaced_block_id: 'tpl-late-b1' }), M.invalidBlock],
  ])('refuses %s', (_name, entry, message) => {
    expect(validateUnplannedInput(entry, IDS)).toBe(message)
  })
})

describe('validatePlannerDay', () => {
  it('accepts a whole valid day, and an empty one', () => {
    expect(validatePlannerDay({ blocks: [completed(), moved(), notCompleted()], unplanned: [unplanned()] }, IDS)).toBeNull()
    expect(validatePlannerDay({ blocks: [], unplanned: [] }, IDS)).toBeNull()
  })
  it('refuses a block that is not part of the shift, and a duplicate block', () => {
    expect(validatePlannerDay({ blocks: [completed({ template_block_id: 'tpl-late-b1' })], unplanned: [] }, IDS)).toBe(M.invalidBlock)
    expect(validatePlannerDay({ blocks: [completed(), completed()], unplanned: [] }, IDS)).toBe(M.duplicateBlock)
  })
  it('refuses a malformed day', () => {
    expect(validatePlannerDay(null, IDS)).toBe(M.invalidBlock)
    expect(validatePlannerDay({ blocks: 'x', unplanned: [] }, IDS)).toBe(M.invalidBlock)
    expect(validatePlannerDay({ blocks: [], unplanned: 'x' }, IDS)).toBe(M.invalidBlock)
  })
  it('reports the first problem of any row', () => {
    expect(validatePlannerDay({ blocks: [completed({ actual_minutes: 0 })], unplanned: [] }, IDS)).toBe(M.invalidMinutes)
    expect(validatePlannerDay({ blocks: [], unplanned: [unplanned({ minutes: 0 })] }, IDS)).toBe(M.invalidMinutes)
  })
})

describe('the unplanned-entry cap', () => {
  const many = (n: number) => Array.from({ length: n }, () => unplanned())
  it('accepts 50 unplanned entries and refuses a 51st with its own message', () => {
    expect(MAX_UNPLANNED).toBe(50)
    expect(M.tooManyUnplanned).toBe('Too many unplanned entries.')
    expect(validatePlannerDay({ blocks: [], unplanned: many(50) }, IDS)).toBeNull()
    expect(validatePlannerDay({ blocks: [], unplanned: many(51) }, IDS)).toBe(M.tooManyUnplanned)
  })
})

describe('malformed input (a forged request)', () => {
  it('refuses a day whose blocks or unplanned list is missing', () => {
    expect(validatePlannerDay({ blocks: undefined, unplanned: [] }, IDS)).toBe(M.invalidBlock)
    expect(validatePlannerDay({ blocks: [], unplanned: undefined }, IDS)).toBe(M.invalidBlock)
    expect(validatePlannerDay('x', IDS)).toBe(M.invalidBlock)
  })

  it('a valid block with its optional keys left out is accepted and normalised to explicit nulls, without throwing', () => {
    const forgedCompleted = { template_block_id: 'tpl-early-b1', status: 'completed', actual_minutes: 30, actual_category: 'qa' }
    const forgedMissed = { template_block_id: 'tpl-early-b3', status: 'not_completed', reason: 'Meeting' }
    const forgedEntry = { category: 'qa', minutes: 5, reason: 'Audit' }
    const day = { blocks: [forgedCompleted, forgedMissed], unplanned: [forgedEntry] } as unknown as Parameters<typeof normalizePlannerDay>[0]
    expect(validatePlannerDay(day, IDS)).toBeNull()
    const normalised = normalizePlannerDay(day)
    expect(normalised.blocks).toEqual([
      { template_block_id: 'tpl-early-b1', status: 'completed', actual_minutes: 30, actual_category: 'qa', actual_activity: null, reason: null },
      { template_block_id: 'tpl-early-b3', status: 'not_completed', actual_minutes: null, actual_category: null, actual_activity: null, reason: 'Meeting' },
    ])
    expect(normalised.unplanned).toEqual([{ category: 'qa', minutes: 5, reason: 'Audit', displaced_block_id: null }])
  })
})

describe('normalizePlannerDay', () => {
  it('trims text and turns blank text into null', () => {
    const day = normalizePlannerDay({
      blocks: [moved({ actual_activity: '  Covered  ', reason: '  Spike  ' }), completed({ actual_activity: '   ', reason: ' ' })],
      unplanned: [unplanned({ reason: '  Escalation  ', displaced_block_id: '' })],
    })
    expect(day.blocks[0]).toMatchObject({ actual_activity: 'Covered', reason: 'Spike' })
    expect(day.blocks[1]).toMatchObject({ actual_activity: null, reason: null })
    expect(day.unplanned[0]).toMatchObject({ reason: 'Escalation', displaced_block_id: null })
  })
})
