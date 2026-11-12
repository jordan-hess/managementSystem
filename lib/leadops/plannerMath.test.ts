import { blocksForTemplate, TEMPLATE_EARLY_ID, TEMPLATE_LATE_ID } from './constants'
import {
  COACHING_SUPPORT_CATEGORIES,
  blockMinutes,
  categoryTotals,
  coachingSupportPercentage,
  collectReasons,
  effectiveActivity,
  effectiveCategory,
  effectiveMinutes,
  formatDuration,
  minutesBetween,
  plannedBreakMinutes,
  plannedMinutes,
  plannerVariancePercentage,
  summariseDay,
  timeToMinutes,
} from './plannerMath'
import type { PlannerBlockLog, PlannerUnplannedEntry } from './types'

const earlyBlocks = blocksForTemplate(TEMPLATE_EARLY_ID)

function log(blockId: string, overrides: Partial<PlannerBlockLog> = {}): PlannerBlockLog {
  return {
    id: `log-${blockId}`,
    tl_id: 'tl-1',
    date: '2026-09-22',
    template_block_id: blockId,
    status: 'completed',
    actual_minutes: null,
    actual_category: null,
    actual_activity: null,
    reason: null,
    updated_at: '',
    ...overrides,
  }
}

/**
 * The canonical mock day, also used by lib/leadops/mockData.ts. Built so the
 * arithmetic is checkable by hand:
 *   planned                     540 (9h)
 *   b5 not completed            -30
 *   b4 moved, ran 45 not 60     -15
 *   one 30m unplanned entry     +30
 *   actual                      525 (8h45m)
 *   diagnostic = 45 moved + 30 unplanned = 75 (1h15m)
 */
const dayLogs: PlannerBlockLog[] = [
  log('tpl-early-b1'),
  log('tpl-early-b2'),
  log('tpl-early-b3'),
  log('tpl-early-b4', {
    status: 'moved',
    actual_minutes: 45,
    actual_category: 'escalations',
    reason: 'VIP escalation ran over; the coaching slot absorbed it.',
  }),
  log('tpl-early-b5', { status: 'not_completed', reason: 'The 10:30 escalation was still open.' }),
  log('tpl-early-b6'),
  log('tpl-early-b7'),
  log('tpl-early-b8'),
  log('tpl-early-b9'),
  log('tpl-early-b10'),
  log('tpl-early-b11'),
]

const dayUnplanned: PlannerUnplannedEntry[] = [
  {
    id: 'unp-1',
    tl_id: 'tl-1',
    date: '2026-09-22',
    category: 'operations',
    minutes: 30,
    reason: 'Unscheduled MNP outage bridge call.',
    displaced_block_id: 'tpl-early-b5',
    created_at: '',
  },
]

describe('time helpers', () => {
  it('parses HH:MM and HH:MM:SS identically', () => {
    expect(timeToMinutes('08:30')).toBe(510) // 8 * 60 + 30
    expect(timeToMinutes('08:30:00')).toBe(510)
  })

  it('measures a block span in minutes', () => {
    expect(minutesBetween('08:30:00', '10:00:00')).toBe(90)
  })

  it('formats durations the way the dashboard reads them', () => {
    expect(formatDuration(210)).toBe('3h30m')
    expect(formatDuration(90)).toBe('1h30m')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(-10)).toBe('0m')
  })
})

describe('shift templates', () => {
  it('has 11 early blocks totalling a 9h day', () => {
    // 30+90+30+60+30+60+60+60+60+30+30 = 540
    expect(earlyBlocks).toHaveLength(11)
    expect(plannedMinutes(earlyBlocks)).toBe(540)
  })

  it('has 10 late blocks totalling a 9h day', () => {
    // 30+90+30+60+60+60+60+60+60+30 = 540
    const lateBlocks = blocksForTemplate(TEMPLATE_LATE_ID)
    expect(lateBlocks).toHaveLength(10)
    expect(plannedMinutes(lateBlocks)).toBe(540)
  })

  it('rosters both templates as 8h of work plus a 1h lunch', () => {
    for (const blocks of [earlyBlocks, blocksForTemplate(TEMPLATE_LATE_ID)]) {
      expect(plannedBreakMinutes(blocks)).toBe(60) // 1h lunch
      expect(plannedMinutes(blocks) - plannedBreakMinutes(blocks)).toBe(480) // 8h work
    }
  })

  it('adds up to a 45h week across five 9h days', () => {
    expect(plannedMinutes(earlyBlocks) * 5).toBe(45 * 60)
  })

  it('keeps every block contiguous with the next', () => {
    for (const blocks of [earlyBlocks, blocksForTemplate(TEMPLATE_LATE_ID)]) {
      for (let i = 1; i < blocks.length; i++) {
        expect(blocks[i].start_time).toBe(blocks[i - 1].end_time)
      }
    }
  })
})

describe('effectiveCategory / effectiveMinutes', () => {
  const block = earlyBlocks[3] // b4, 10:30-11:30 coaching, 60m

  it('uses the template category for a completed block', () => {
    expect(effectiveCategory(log(block.id), block)).toBe('coaching')
    expect(effectiveMinutes(log(block.id), block)).toBe(60)
  })

  it('uses the re-tagged category and actual duration for a moved block', () => {
    const moved = log(block.id, { status: 'moved', actual_category: 'escalations', actual_minutes: 45 })
    expect(effectiveCategory(moved, block)).toBe('escalations')
    expect(effectiveMinutes(moved, block)).toBe(45)
  })

  it('falls back to the template category when a moved block was not re-tagged', () => {
    const moved = log(block.id, { status: 'moved', actual_minutes: 45 })
    expect(effectiveCategory(moved, block)).toBe('coaching')
  })

  it('honors a re-tagged category on a completed block too, not just moved', () => {
    // Every block's category is TL-entered now, so a completed block can be
    // logged under a different category than the template's — previously
    // only 'moved' could override this.
    const completed = log(block.id, { status: 'completed', actual_category: 'admin' })
    expect(effectiveCategory(completed, block)).toBe('admin')
  })

  it('counts a not_completed block for nothing at all', () => {
    const missed = log(block.id, { status: 'not_completed', reason: 'ran out of day' })
    expect(effectiveCategory(missed, block)).toBeNull()
    expect(effectiveMinutes(missed, block)).toBe(0)
  })

  it('counts a still-planned block for nothing', () => {
    expect(effectiveCategory(log(block.id, { status: 'planned' }), block)).toBeNull()
    expect(effectiveMinutes(log(block.id, { status: 'planned' }), block)).toBe(0)
  })

  it('treats an unlogged block as planned', () => {
    expect(effectiveMinutes(undefined, block)).toBe(0)
    expect(blockMinutes(block)).toBe(60)
  })
})

describe('effectiveActivity', () => {
  const block = earlyBlocks[3] // b4, 'Coaching session' placeholder

  it('falls back to the template activity as a placeholder when nothing was entered', () => {
    expect(effectiveActivity(log(block.id), block)).toBe(block.activity)
    expect(effectiveActivity(undefined, block)).toBe(block.activity)
  })

  it('uses the TL-entered activity when set', () => {
    expect(effectiveActivity(log(block.id, { actual_activity: 'Escalation huddle' }), block)).toBe('Escalation huddle')
  })

  it('falls back when the entry is blank/whitespace-only', () => {
    expect(effectiveActivity(log(block.id, { actual_activity: '   ' }), block)).toBe(block.activity)
    expect(effectiveActivity(log(block.id, { actual_activity: '' }), block)).toBe(block.activity)
  })
})

describe('categoryTotals', () => {
  const totals = categoryTotals(earlyBlocks, dayLogs, dayUnplanned)
  const minutesFor = (c: string) => totals.find((t) => t.category === c)?.minutes

  it('groups by the category the time was actually worked as', () => {
    expect(minutesFor('operations')).toBe(180) // b2 90 + b9 60 + 30 unplanned
    expect(minutesFor('qa')).toBe(90) // b3 30 + b7 60
    expect(minutesFor('coaching')).toBe(60) // b8 only; b4 was re-tagged away
    expect(minutesFor('escalations')).toBe(45) // b4's moved 45m landed here
    expect(minutesFor('team_management')).toBe(30) // b1
    expect(minutesFor('admin')).toBe(60) // b10 30 + b11 30
    expect(minutesFor('break')).toBe(60) // b6
  })

  it('omits the categories that earned no time', () => {
    // b5 (escalations, 30m) was not completed, but b4 moved INTO escalations,
    // so the category still appears — with only the moved block's minutes.
    expect(totals.every((t) => t.minutes > 0)).toBe(true)
  })

  it('sums to the day actually worked, not to the planned day', () => {
    // 180 + 60 + 90 + 30 + 60 + 60 + 45 = 525
    expect(totals.reduce((s, t) => s + t.minutes, 0)).toBe(525)
    expect(plannedMinutes(earlyBlocks)).toBe(540)
  })

  it('returns categories in dashboard display order', () => {
    expect(totals.map((t) => t.category)).toEqual([
      'operations',
      'coaching',
      'qa',
      'team_management',
      'admin',
      'break',
      'escalations',
    ])
  })
})

describe('summariseDay', () => {
  const summary = summariseDay(earlyBlocks, dayLogs, dayUnplanned)

  it('reports planned and actual separately', () => {
    expect(summary.plannedMinutes).toBe(540)
    expect(summary.actualMinutes).toBe(525)
    expect(formatDuration(summary.plannedMinutes)).toBe('9h')
    expect(formatDuration(summary.actualMinutes)).toBe('8h45m')
  })

  it('splits the rostered day into work and lunch', () => {
    expect(summary.plannedWorkMinutes).toBe(480) // 8h
    expect(summary.plannedBreakMinutes).toBe(60) // 1h lunch
    // Lunch was taken in full, so the 15m shortfall is all work time.
    expect(summary.actualBreakMinutes).toBe(60)
    expect(summary.actualWorkMinutes).toBe(465) // 7h45m
    expect(formatDuration(summary.actualWorkMinutes)).toBe('7h45m')
  })

  it('reports the unplanned/moved diagnostic as moved + unplanned only', () => {
    // 45 (b4 moved) + 30 (unplanned) = 75. b5's missed 30m is NOT counted —
    // it is work that never happened, not work that moved.
    expect(summary.unplannedOrMovedMinutes).toBe(75)
    expect(formatDuration(summary.unplannedOrMovedMinutes)).toBe('1h15m')
  })

  it('overlaps the category totals by design', () => {
    // The 45m moved and 30m unplanned are already inside actualMinutes.
    const inCategories = summary.categoryTotals.reduce((s, t) => s + t.minutes, 0)
    expect(inCategories).toBe(summary.actualMinutes)
    expect(summary.unplannedOrMovedMinutes).toBeLessThan(inCategories)
  })
})

describe('collectReasons', () => {
  const reasons = collectReasons(earlyBlocks, dayLogs, dayUnplanned)

  it('captures a reason for every moved, not-completed and unplanned row', () => {
    expect(reasons).toHaveLength(3)
    expect(reasons.map((r) => r.kind)).toEqual(['moved', 'not_completed', 'unplanned'])
    expect(reasons.every((r) => r.reason.length > 0)).toBe(true)
  })

  it('reports the planned minutes lost for a not-completed block', () => {
    const missed = reasons.find((r) => r.kind === 'not_completed')
    expect(missed?.minutes).toBe(30) // the block's planned duration, though it counted zero
  })
})

describe('planner-derived KPI inputs', () => {
  const summary = summariseDay(earlyBlocks, dayLogs, dayUnplanned)

  it('sums the three confirmed categories, and excludes Escalations', () => {
    // Confirmed definition: Coaching & People Development, Quality &
    // Operations, Floor Support & Ad-hoc -> Coaching, QA, Operations.
    expect(COACHING_SUPPORT_CATEGORIES).toEqual(['coaching', 'qa', 'operations'])
    expect(COACHING_SUPPORT_CATEGORIES).not.toContain('escalations')
  })

  it('derives % time on coaching & support over WORK time, excluding lunch', () => {
    // (60 coaching + 90 qa + 180 operations) = 330, over 465 work minutes
    // (525 actual - 60 lunch) = 70.96 -> 71. Dividing by the full 525 would
    // read 63% and understate every activity by about a ninth.
    expect(coachingSupportPercentage(summary)).toBe(71)
  })

  it('derives planner variance over planned WORK time, excluding lunch', () => {
    // 75 / 480 (the 8h of work, not the 9h rostered day) = 15.6 -> 16.
    // Dividing by 540 would read 14% and flatter the figure.
    expect(plannerVariancePercentage(summary)).toBe(16)
  })

  it('keeps lunch out of every KPI denominator', () => {
    // Both planner-fed KPIs divide by work time, never the rostered day.
    expect(summary.plannedWorkMinutes).toBe(480)
    expect(summary.actualWorkMinutes).toBe(465)
    expect(plannerVariancePercentage(summary)).toBe(
      Math.round((summary.unplannedOrMovedMinutes / summary.plannedWorkMinutes) * 100),
    )
    expect(coachingSupportPercentage(summary)).toBe(
      Math.round((330 / summary.actualWorkMinutes) * 100),
    )
  })

  it('does not divide by zero on an empty day', () => {
    const empty = summariseDay([], [], [])
    expect(coachingSupportPercentage(empty)).toBe(0)
    expect(plannerVariancePercentage(empty)).toBe(0)
  })
})
