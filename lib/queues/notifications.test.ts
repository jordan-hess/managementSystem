jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))

import { readFileSync } from 'fs'
import { join } from 'path'
import { sql } from '@/lib/db/pool'
import { notifyQueueAssignment } from './notifications'

const mockSql = sql as unknown as jest.Mock

/** The text of every template this call emitted. */
function emitted(): string {
  return mockSql.mock.calls.map((args) => (Array.isArray(args[0]) ? (args[0] as string[]).join(' ') : '')).join(' | ')
}

/** The interpolated values of the INSERT, in order. */
function insertValues(): unknown[] {
  const call = mockSql.mock.calls.find((args) =>
    Array.isArray(args[0]) && (args[0] as string[]).join(' ').includes('INSERT INTO notifications'),
  )
  return call ? call.slice(1) : []
}

beforeEach(() => {
  mockSql.mockReset()
  mockSql.mockResolvedValue([{ full_name: 'Thandi Mokoena' }])
})

describe('notifyQueueAssignment', () => {
  it('writes a queue_assignment notification to the agent', async () => {
    await notifyQueueAssignment({
      agentId: 'agent-1', assignedBy: 'lead-1', queue: 'TikTok', date: '2026-09-23',
    })

    expect(emitted()).toContain('INSERT INTO notifications')
    const values = insertValues()
    expect(values[0]).toBe('agent-1') // recipient
    expect(values[1]).toBe('lead-1') // sender
    expect(values[2]).toBe('lead-1') // related_profile_id — who assigned it
    // 'queue_assignment' is a literal in the template, not an interpolated
    // value, so it shows up in the SQL text rather than the args.
    expect(emitted()).toContain('queue_assignment')
  })

  it('names the assigner and the queue in the message', async () => {
    await notifyQueueAssignment({
      agentId: 'agent-1', assignedBy: 'lead-1', queue: 'ICASA', date: '2026-09-23',
    })
    const message = insertValues()[4] as string
    expect(message).toContain('Thandi Mokoena')
    expect(message).toContain('ICASA')
  })

  it('includes the reason when one was given', async () => {
    await notifyQueueAssignment({
      agentId: 'agent-1', assignedBy: 'lead-1', queue: 'ODU', date: '2026-09-23', reason: 'Covering for Sipho',
    })
    expect(insertValues()[4] as string).toContain('Covering for Sipho')
  })

  it('omits the reason clause when none was given', async () => {
    await notifyQueueAssignment({
      agentId: 'agent-1', assignedBy: 'lead-1', queue: 'ODU', date: '2026-09-23',
    })
    expect(insertValues()[4] as string).not.toContain('Reason:')
  })

  it('returns the inserted notification id so Undo can retract it', async () => {
    mockSql.mockResolvedValueOnce([{ full_name: 'Thandi Mokoena' }]).mockResolvedValueOnce([{ id: 'n-9' }])
    await expect(
      notifyQueueAssignment({ agentId: 'agent-1', assignedBy: 'lead-1', queue: 'ODU', date: '2026-09-23' }),
    ).resolves.toBe('n-9')
    expect(emitted()).toMatch(/RETURNING id/)
  })

  it('sends one summary for several days on the same queue', async () => {
    await notifyQueueAssignment({
      agentId: 'agent-1', assignedBy: 'lead-1', queue: 'Reddit', date: '2026-09-21', days: 7,
    })
    const inserts = mockSql.mock.calls.filter((args) =>
      Array.isArray(args[0]) && (args[0] as string[]).join(' ').includes('INSERT INTO notifications'),
    )
    expect(inserts).toHaveLength(1)
    expect(insertValues()[3]).toBe("You're on Reddit for 7 days")
    expect(insertValues()[4]).toBe('Thandi Mokoena placed you on the Reddit queue for 7 days from 2026-09-21.')
  })

  it('does not claim one queue when the days differ', async () => {
    await notifyQueueAssignment({
      agentId: 'agent-1', assignedBy: 'lead-1', queue: null, date: '2026-09-21', days: 3,
    })
    expect(insertValues()[3]).toBe('Your queues for 3 days are set')
    expect(insertValues()[4]).toBe("Thandi Mokoena placed you on queues for 3 days from 2026-09-21.")
  })

  it('never renders "null" for a one-day batch of several queues', async () => {
    await notifyQueueAssignment({
      agentId: 'agent-1', assignedBy: 'lead-1', queue: null, date: '2026-09-21', days: 1,
    })
    expect(insertValues()[3]).toBe('Your queues for 2026-09-21 are set')
    expect(insertValues()[4]).toBe('Thandi Mokoena placed you on several queues on 2026-09-21.')
    expect(String(insertValues()[3])).not.toContain('null')
    expect(String(insertValues()[4])).not.toContain('null')
  })

  it('says additional platform for an additional-only add', async () => {
    await notifyQueueAssignment({
      agentId: 'agent-1', assignedBy: 'lead-1', queue: 'Dark posts', date: '2026-09-21', additional: true,
    })
    expect(insertValues()[3]).toBe("You're also on Dark posts")
    expect(insertValues()[4]).toBe('Thandi Mokoena added Dark posts as an additional platform for you on 2026-09-21.')
  })

  it('keeps the main-only wording unchanged', async () => {
    await notifyQueueAssignment({
      agentId: 'agent-1', assignedBy: 'lead-1', queue: 'ODU', date: '2026-09-21', additional: false,
    })
    expect(insertValues()[3]).toBe("You're on ODU")
    expect(insertValues()[4]).toBe('Thandi Mokoena assigned you to the ODU queue on 2026-09-21.')
  })

  it('stays silent when someone sets their own queue', async () => {
    // setMyQueueAction is self-service — telling you about your own click is
    // noise, so the same-person case is dropped before any query runs.
    await expect(
      notifyQueueAssignment({ agentId: 'agent-1', assignedBy: 'agent-1', queue: 'LinkedIn', date: '2026-09-23' }),
    ).resolves.toBeNull()
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('never throws — the assignment has already committed by this point', async () => {
    mockSql.mockRejectedValue(new Error('db down'))
    await expect(
      notifyQueueAssignment({ agentId: 'agent-1', assignedBy: 'lead-1', queue: 'Sprinklr', date: '2026-09-23' }),
    ).resolves.toBeNull()
  })
})

describe('the notification type must exist in the database too', () => {
  const sqlText = readFileSync(
    join(process.cwd(), 'Database/migrations/queue-assignment-notifications-2026-09-23.sql'),
    'utf8',
  )

  it('widens notifications_type_check to accept queue_assignment', () => {
    expect(sqlText).toContain("'queue_assignment'")
    expect(sqlText).toMatch(/ALTER\s+TABLE\s+notifications/i)
  })

  it('keeps every pre-existing type in the recreated constraint', () => {
    // It is a drop-and-recreate, so omitting one would silently break that
    // notification everywhere it is raised.
    for (const t of [
      'info', 'followup', 'escalation', 'reminder', 'request',
      'callback', 'warning', 'attendance_pattern', 'schedule_conflict', 'password_reset',
    ]) {
      expect(sqlText).toContain(`'${t}'`)
    }
  })
})
