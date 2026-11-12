jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/roster/scheduleAlerts', () => ({ getAgentsOffOnDate: jest.fn() }))
jest.mock('@/lib/roster/onShift', () => ({ getRosterAt: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { getAgentsOffOnDate } from '@/lib/roster/scheduleAlerts'
import { getRosterAt } from '@/lib/roster/onShift'
import { runDueSweeps } from './dueSweep'

const mockSql = sql as unknown as jest.Mock
const mockOffOnDate = getAgentsOffOnDate as unknown as jest.Mock
const mockOnShift = getRosterAt as unknown as jest.Mock

function text(args: unknown[]): string {
  return Array.isArray(args[0]) ? (args[0] as string[]).join(' ') : ''
}
function callsMatching(fragment: string) {
  return mockSql.mock.calls.filter((args) => text(args).includes(fragment))
}

/**
 * Drives the sweep by responding to each query in turn. `lockHeld` controls
 * whether this caller wins the advisory lock; `claimed` is what the
 * follow-up claim UPDATE returns.
 */
function primeSql(opts: {
  lockHeld?: boolean
  claimed?: unknown[]
  leaders?: unknown[]
  callbacks?: unknown[]
  ownLeaderLinks?: unknown[]
  allLeaders?: unknown[]
  insertFails?: boolean
} = {}) {
  const {
    lockHeld = true, claimed = [], leaders = [{ profile_id: 'lead-1' }],
    callbacks = [], ownLeaderLinks = [], allLeaders = [], insertFails = false,
  } = opts
  mockSql.mockImplementation((...args: unknown[]) => {
    const t = text(args)
    if (t.includes('pg_try_advisory_lock')) return Promise.resolve([{ locked: lockHeld }])
    if (t.includes('pg_advisory_unlock')) return Promise.resolve([{}])
    if (t.includes('UPDATE callbacks SET reminder_sent = TRUE')) return Promise.resolve(callbacks)
    if (t.includes('UPDATE callbacks SET reminder_sent = FALSE')) return Promise.resolve([{}])
    if (t.includes('FROM customers')) return Promise.resolve([{ id: 'cust-1', name: 'Acme' }])
    if (t.includes('SELECT id, full_name FROM profiles')) return Promise.resolve([{ id: 'agent-1', full_name: 'Nomsa Dlamini' }])
    if (t.includes('AS leader_id')) return Promise.resolve(ownLeaderLinks)
    if (t.includes('FROM team_leaders')) return Promise.resolve(allLeaders)
    if (t.includes('unnest')) return insertFails ? Promise.reject(new Error('insert failed')) : Promise.resolve([{}])
    if (t.includes('UPDATE followups')) return Promise.resolve(claimed)
    if (t.includes('FROM team_members')) return Promise.resolve(leaders)
    if (t.includes('full_name FROM profiles')) return Promise.resolve([{ full_name: 'Nomsa Dlamini' }])
    if (t.includes('INSERT INTO notifications')) return Promise.resolve([{}])
    return Promise.resolve([])
  })
}

const callbackDue = { id: 'cb-1', agent_id: 'agent-1', customer_id: 'cust-1', scheduled_at: '2026-10-12T08:03:00.000Z' } // 10:03 SAST

const dueSoon = {
  id: 'f-1',
  agent_id: 'agent-1',
  due_date: '2026-09-23T14:30:00.000Z',
  query_description: 'Customer waiting on a porting outcome.',
}

beforeEach(() => {
  mockSql.mockReset()
  mockOffOnDate.mockReset()
  mockOffOnDate.mockResolvedValue(new Set())
  mockOnShift.mockReset()
  mockOnShift.mockResolvedValue({ onShift: new Set(['agent-1']), unrostered: new Set() })
})

describe('the advisory lock', () => {
  it('does the work when it wins the lock', async () => {
    primeSql({ lockHeld: true })
    const result = await runDueSweeps()
    expect(result.ran).toBe(true)
    expect(callsMatching('UPDATE callbacks SET reminder_sent = TRUE')).toHaveLength(1)
  })

  it('skips instantly when another caller holds it', async () => {
    // 40 agents polling at once must not run 40 sweeps.
    primeSql({ lockHeld: false })
    const result = await runDueSweeps()
    expect(result.ran).toBe(false)
    expect(callsMatching('UPDATE callbacks')).toHaveLength(0)
    expect(callsMatching('UPDATE followups')).toHaveLength(0)
  })

  it('releases the lock even when the sweep throws', async () => {
    mockSql.mockImplementation((...args: unknown[]) => {
      const t = text(args)
      if (t.includes('pg_try_advisory_lock')) return Promise.resolve([{ locked: true }])
      if (t.includes('pg_advisory_unlock')) return Promise.resolve([{}])
      if (t.includes('UPDATE callbacks')) return Promise.reject(new Error('boom'))
      return Promise.resolve([])
    })
    await runDueSweeps()
    expect(callsMatching('pg_advisory_unlock')).toHaveLength(1)
  })
})

describe('callback reminders', () => {
  const insertCall = () => callsMatching('unnest')[0]

  it('claims due callbacks atomically so concurrent pollers cannot double-notify', async () => {
    primeSql({ callbacks: [] })
    await runDueSweeps()
    const t = text(callsMatching('UPDATE callbacks SET reminder_sent = TRUE')[0])
    expect(t).toContain('reminder_sent = FALSE')
    expect(t).toContain("status = 'pending'")
    expect(t).toContain("INTERVAL '5 minutes'")
    expect(t).toContain('RETURNING')
  })

  it('does nothing further when no callback is due', async () => {
    primeSql({ callbacks: [] })
    const result = await runDueSweeps()
    expect(result.callbackReminders).toBe(0)
    expect(mockOnShift).not.toHaveBeenCalled()
    expect(callsMatching('unnest')).toHaveLength(0)
  })

  it('reminds the agent when they are on shift', async () => {
    mockOnShift.mockResolvedValue({ onShift: new Set(['agent-1']), unrostered: new Set() })
    primeSql({ callbacks: [callbackDue], ownLeaderLinks: [{ agent_id: 'agent-1', leader_id: 'lead-own' }], allLeaders: [{ profile_id: 'lead-own' }] })

    const result = await runDueSweeps()

    expect(result.callbackReminders).toBe(1)
    expect(insertCall()[1]).toEqual(['agent-1']) // recipient ids
    expect(text(insertCall())).toContain('unnest')
    expect((insertCall()[5] as string[])[0]).toBe('Upcoming Callback: Acme')
  })

  it('labels a manual callback by its contact name, never its number or email', async () => {
    mockOnShift.mockResolvedValue({ onShift: new Set(['agent-1']), unrostered: new Set() })
    const manual = { ...callbackDue, id: 'cb-2', customer_id: null, contact_name: 'Ann', contact_phone: '0821234567', contact_email: null }
    primeSql({ callbacks: [manual] })

    await runDueSweeps()

    const titles = insertCall()[5] as string[]
    const messages = insertCall()[6] as string[]
    expect(titles[0]).toBe('Upcoming Callback: Ann')
    expect(messages.join(' ')).not.toContain('0821234567')
  })

  it('falls back to "a callback contact" for a manual callback with no name', async () => {
    mockOnShift.mockResolvedValue({ onShift: new Set(['agent-1']), unrostered: new Set() })
    const manual = { ...callbackDue, id: 'cb-3', customer_id: null, contact_name: null, contact_phone: '0821234567', contact_email: null }
    primeSql({ callbacks: [manual] })

    await runDueSweeps()

    expect((insertCall()[5] as string[])[0]).toBe('Upcoming Callback: a callback contact')
  })

  it('does not ask for customers by a null id when every due callback is manual', async () => {
    mockOnShift.mockResolvedValue({ onShift: new Set(['agent-1']), unrostered: new Set() })
    const manual = { ...callbackDue, id: 'cb-4', customer_id: null, contact_name: 'Ann', contact_phone: '0821234567', contact_email: null }
    primeSql({ callbacks: [manual] })

    await runDueSweeps()

    const customerQuery = callsMatching('FROM customers')[0]
    expect((customerQuery[1] as unknown[]).includes(null)).toBe(false)
  })

  it('reminds the agent\'s own team leader when the agent is off shift', async () => {
    mockOnShift.mockResolvedValue({ onShift: new Set(['lead-own', 'lead-other']), unrostered: new Set() })
    primeSql({
      callbacks: [callbackDue],
      ownLeaderLinks: [{ agent_id: 'agent-1', leader_id: 'lead-own' }],
      allLeaders: [{ profile_id: 'lead-own' }, { profile_id: 'lead-other' }],
    })

    await runDueSweeps()

    expect(insertCall()[1]).toEqual(['lead-own'])
    const title = (insertCall()[5] as string[])[0]
    expect(title).toContain('Nomsa Dlamini')
    expect(title).toContain('10:03')
  })

  it('reminds every team leader on shift when the agent and their own leader are off', async () => {
    mockOnShift.mockResolvedValue({ onShift: new Set(['lead-other-1', 'lead-other-2']), unrostered: new Set() })
    primeSql({
      callbacks: [callbackDue],
      ownLeaderLinks: [{ agent_id: 'agent-1', leader_id: 'lead-own' }],
      allLeaders: [{ profile_id: 'lead-own' }, { profile_id: 'lead-other-1' }, { profile_id: 'lead-other-2' }],
    })

    await runDueSweeps()

    expect(insertCall()[1]).toEqual(['lead-other-1', 'lead-other-2'])
  })

  it('still reminds the agent when nobody at all is on shift', async () => {
    mockOnShift.mockResolvedValue({ onShift: new Set(), unrostered: new Set() })
    primeSql({ callbacks: [callbackDue], allLeaders: [{ profile_id: 'lead-own' }] })

    await runDueSweeps()

    expect(insertCall()[1]).toEqual(['agent-1'])
  })

  it('reminds an unrostered agent themselves even when their leaders are on shift', async () => {
    mockOnShift.mockResolvedValue({ onShift: new Set(['lead-own']), unrostered: new Set(['agent-1']) })
    primeSql({
      callbacks: [callbackDue],
      ownLeaderLinks: [{ agent_id: 'agent-1', leader_id: 'lead-own' }],
      allLeaders: [{ profile_id: 'lead-own' }],
    })

    await runDueSweeps()

    expect(insertCall()[1]).toEqual(['agent-1'])
  })

  it('only considers active team leaders as candidates', async () => {
    primeSql({ callbacks: [callbackDue] })
    await runDueSweeps()
    expect(text(callsMatching('AS leader_id')[0])).toContain('is_active')
    expect(text(callsMatching('FROM team_leaders')[0])).toContain('is_active')
  })

  it('looks up who is on shift once per distinct due time, not once per callback', async () => {
    primeSql({ callbacks: [callbackDue, { ...callbackDue, id: 'cb-2' }], allLeaders: [{ profile_id: 'lead-own' }] })
    await runDueSweeps()
    expect(mockOnShift).toHaveBeenCalledTimes(1)
  })

  it('releases the claim when the insert fails, so the reminder is retried instead of lost', async () => {
    primeSql({ callbacks: [callbackDue], insertFails: true })

    await expect(runDueSweeps()).resolves.toBeDefined()

    const release = callsMatching('UPDATE callbacks SET reminder_sent = FALSE')
    expect(release).toHaveLength(1)
    expect(release[0][1]).toEqual(['cb-1'])
  })

  it('a failing callback sweep does not stop the follow-up sweep', async () => {
    mockOnShift.mockRejectedValue(new Error('roster down'))
    mockOffOnDate.mockResolvedValue(new Set(['agent-1']))
    primeSql({ callbacks: [callbackDue], claimed: [dueSoon] })

    const result = await runDueSweeps()

    expect(result.ran).toBe(true)
    expect(result.followupAlerts).toBe(1)
  })
})

describe('follow-ups falling due', () => {
  it('claims candidates atomically, so concurrent callers cannot double-alert', async () => {
    primeSql({ claimed: [dueSoon] })
    await runDueSweeps()
    const claim = callsMatching('UPDATE followups')[0]
    const t = text(claim)
    expect(t).toContain('due_alert_sent = TRUE')
    expect(t).toContain('due_alert_sent = FALSE')
    expect(t).toContain('RETURNING')
  })

  it('only considers follow-ups that are still open', async () => {
    primeSql({ claimed: [] })
    await runDueSweeps()
    expect(text(callsMatching('UPDATE followups')[0])).toContain("status IN ('open', 'in_progress')")
  })

  it('alerts the team leaders when the agent is off that day', async () => {
    mockOffOnDate.mockResolvedValue(new Set(['agent-1']))
    primeSql({ claimed: [dueSoon] })

    const result = await runDueSweeps()

    expect(result.followupAlerts).toBe(1)
    const insert = callsMatching('INSERT INTO notifications')[0]
    expect(insert[1]).toBe('lead-1') // recipient is the leader, not the agent
    expect(text(insert)).toContain('schedule_conflict')
  })

  it('stays silent when the agent is on shift', async () => {
    mockOffOnDate.mockResolvedValue(new Set()) // nobody off
    primeSql({ claimed: [dueSoon] })

    const result = await runDueSweeps()

    expect(result.followupAlerts).toBe(0)
    expect(callsMatching('INSERT INTO notifications')).toHaveLength(0)
  })

  it('still claims a follow-up whose agent is on shift, so it is not re-checked every 30s', async () => {
    mockOffOnDate.mockResolvedValue(new Set())
    primeSql({ claimed: [dueSoon] })
    await runDueSweeps()
    expect(callsMatching('UPDATE followups')).toHaveLength(1)
  })

  it('no-ops when the agent has no team leader to tell', async () => {
    mockOffOnDate.mockResolvedValue(new Set(['agent-1']))
    primeSql({ claimed: [dueSoon], leaders: [] })

    const result = await runDueSweeps()

    expect(result.followupAlerts).toBe(0)
    expect(callsMatching('INSERT INTO notifications')).toHaveLength(0)
  })

  it('resolves shifts once per due date, not once per follow-up', async () => {
    // Resolving a shift is several queries; a batch due the same day must
    // not multiply that.
    mockOffOnDate.mockResolvedValue(new Set(['agent-1', 'agent-2']))
    primeSql({
      claimed: [
        dueSoon,
        { ...dueSoon, id: 'f-2', agent_id: 'agent-2' },
        { ...dueSoon, id: 'f-3', agent_id: 'agent-1' },
      ],
    })

    await runDueSweeps()

    expect(mockOffOnDate).toHaveBeenCalledTimes(1)
    expect(mockOffOnDate.mock.calls[0][0].sort()).toEqual(['agent-1', 'agent-2'])
  })

  it('ignores anything long past due, so a morning sign-in does not fire a backlog', async () => {
    primeSql({ claimed: [] })
    await runDueSweeps()
    const t = text(callsMatching('UPDATE followups')[0])
    expect(t).toContain('due_date <=') // the 10-minute lead
    expect(t).toContain('due_date >=') // the staleness floor
  })
})

describe('failure handling', () => {
  it('never throws — a user is asking for their notification list, not this', async () => {
    mockSql.mockRejectedValue(new Error('db down'))
    await expect(runDueSweeps()).resolves.toEqual({ ran: false, followupAlerts: 0, callbackReminders: 0 })
  })
})
