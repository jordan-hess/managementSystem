import { ASSIGNABLE_QUEUES } from '@/lib/queues/constants'
import type { Department } from '@/lib/departments'
import {
  BOARD_QUEUES, targetFor, laneStatus, laneCounts, coverage, autoFillPlan, initials, queueGroupOf, buildBoards,
  laneOf, agentLanes, removedMainLabel, cardId, parseCardId,
  type BoardAgent, type BoardMap, type AdditionalMap, type BoardDay,
} from './board'

const a = (id: string, department: Department): BoardAgent => ({ id, full_name: id, department })
const day = (main: BoardMap, additional: AdditionalMap = {}): BoardDay => ({ main, additional })

describe('queue board logic', () => {
  it('board queues exclude the removed lanes and are all assignable', () => {
    for (const q of ['ICASA', 'Reddit', 'freescout', 'whatsapp', 'TrustPilot', 'LinkedIn']) {
      expect(BOARD_QUEUES).not.toContain(q)
    }
    for (const q of BOARD_QUEUES) expect(ASSIGNABLE_QUEUES).toContain(q)
    expect(BOARD_QUEUES).toHaveLength(14)
  })
  it.each([[0, 1, 'empty', 'Empty'], [1, 2, 'short', 'Needs 1'], [2, 2, 'met', 'Covered'], [4, 2, 'over', '+2 extra']])(
    'laneStatus(%i, %i) is %s', (c, t, state, label) => expect(laneStatus(c, t)).toEqual({ state, label }))
  it('targets default to 1 with ADVANCED at 2', () => { expect(targetFor('VOICE')).toBe(1); expect(targetFor('ADVANCED')).toBe(2) })
  it('laneCounts tallies agents per queue and ignores bench', () => {
    const c = laneCounts(day({ '1': 'ADVANCED', '2': 'ADVANCED', '3': null }))
    expect(c.ADVANCED).toBe(2)
    expect(c.VOICE).toBe(0)
  })
  it('queueGroupOf finds the group of a queue', () => {
    expect(queueGroupOf('VOICE')?.key).toBe('T2')
    expect(queueGroupOf('Teams')?.key).toBe('Billing')
    expect(queueGroupOf('nope')).toBeUndefined()
  })
  it('coverage counts met/over lanes as covered and the rest as short', () => {
    const agents = [a('1', 'T2'), a('2', 'T2'), a('3', 'Social')]
    const c = coverage(day({ '1': 'ADVANCED', '2': 'VOICE' }), agents)
    expect(c).toEqual({ covered: 1, total: 14, onQueue: 2, onBench: 1, short: 13 })
  })
  it('auto-fill prefers the queue department, then anyone, in display order, using each agent once', () => {
    const agents = [a('s1', 'Social'), a('t1', 'T2'), a('t2', 'T2')]
    const plan = autoFillPlan(day({}), agents)
    expect(plan.slice(0, 3)).toEqual([
      { userId: 't1', queue: 'ADVANCED' }, { userId: 't2', queue: 'ADVANCED' }, { userId: 's1', queue: 'SIM SWAP' },
    ])
    expect(plan).toHaveLength(3)
  })
  it('auto-fill leaves already-placed agents alone and fills only the gap', () => {
    expect(autoFillPlan(day({ t1: 'ADVANCED' }), [a('t1', 'T2'), a('t2', 'T2')])).toEqual([{ userId: 't2', queue: 'ADVANCED' }])
  })
  it('initials uses first and last name', () => { expect(initials('Chris Walker')).toBe('CW'); expect(initials('Cher')).toBe('C') })
  it('buildBoards keeps only assignments for agents that have a card', () => {
    // x1 self-assigned via MyQueueWidget, or was deactivated / changed role:
    // there is no card for them, so they must not count towards coverage.
    const boards = buildBoards(
      ['2030-01-07', '2030-01-08'],
      ['t1'],
      [
        { user_id: 't1', date: '2030-01-07', queue: 'VOICE' },
        { user_id: 'x1', date: '2030-01-07', queue: 'PORTING' },
        { user_id: 't1', date: '2029-12-31', queue: 'ODU' }, // outside the loaded dates
      ],
      [],
    )
    expect(boards).toEqual({
      '2030-01-07': { main: { t1: 'VOICE' }, additional: {} },
      '2030-01-08': { main: {}, additional: {} },
    })
    expect(laneCounts(boards['2030-01-07']).PORTING).toBe(0)
    expect(coverage(boards['2030-01-07'], [a('t1', 'T2')]).covered).toBe(1)
  })
  it('laneOf maps legacy values into the combined lane and removed lanes to null', () => {
    expect(laneOf('LinkedIn')).toBe('TrustPilot & LinkedIn')
    expect(laneOf('TrustPilot')).toBe('TrustPilot & LinkedIn')
    expect(laneOf('freescout')).toBeNull()
    expect(laneOf('VOICE')).toBe('VOICE')
  })
  it('laneCounts counts each agent once per lane, main and additional', () => {
    const c = laneCounts(day({ a: 'mybroadband', b: 'LinkedIn' }, { a: ['Dark posts', 'mybroadband'], b: ['TrustPilot'] }))
    expect(c.mybroadband).toBe(1)
    expect(c['Dark posts']).toBe(1)
    expect(c['TrustPilot & LinkedIn']).toBe(1)
  })
  it('agentLanes drops removed, main-duplicate and repeated additionals', () => {
    expect(agentLanes(day({ a: 'ODU' }, { a: ['ODU', 'freescout', 'TikTok', 'TikTok'] }), 'a'))
      .toEqual({ main: 'ODU', additional: ['TikTok'] })
  })
  it('puts a removed-lane main without additionals on the bench, with a label', () => {
    const d = day({ a: 'freescout' })
    expect(coverage(d, [a('a', 'Social')]).onBench).toBe(1)
    expect(removedMainLabel(d, 'a')).toBe('Freescout')
    expect(removedMainLabel(day({ a: 'VOICE' }), 'a')).toBeNull()
  })
  it('takes a removed-lane main with additionals off the bench', () => {
    expect(coverage(day({ a: 'freescout' }, { a: ['Dark posts'] }), [a('a', 'Social')]).onQueue).toBe(1)
  })
  it('auto-fill never picks an agent who has any main row, removed lanes included', () => {
    expect(autoFillPlan(day({ a: 'whatsapp' }), [a('a', 'Social')])).toEqual([])
  })
  it('auto-fill treats a lane covered by an additional as covered', () => {
    const plan = autoFillPlan(day({ x: 'VOICE' }, { x: ['Dark posts'] }), [a('x', 'T2'), a('s', 'Social')])
    expect(plan.map((p) => p.queue)).not.toContain('Dark posts')
  })
  it('buildBoards splits main and additional rows and drops agents without a card', () => {
    const boards = buildBoards(
      ['2030-01-07'],
      ['a'],
      [{ user_id: 'a', date: '2030-01-07', queue: 'VOICE' }, { user_id: 'ghost', date: '2030-01-07', queue: 'ODU' }],
      [
        { user_id: 'a', date: '2030-01-07', queue: 'Dark posts' },
        { user_id: 'a', date: '2030-01-07', queue: 'TikTok' },
        { user_id: 'ghost', date: '2030-01-07', queue: 'TikTok' },
      ],
    )
    expect(boards).toEqual({ '2030-01-07': { main: { a: 'VOICE' }, additional: { a: ['Dark posts', 'TikTok'] } } })
  })
  it('cardId and parseCardId round-trip, including a lane with spaces and &', () => {
    expect(parseCardId(cardId('u1', 'TrustPilot & LinkedIn'))).toEqual({ agentId: 'u1', additionalLane: 'TrustPilot & LinkedIn' })
    expect(parseCardId(cardId('u1'))).toEqual({ agentId: 'u1', additionalLane: null })
  })
})
