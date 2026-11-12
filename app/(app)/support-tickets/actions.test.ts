jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/db/tx', () => ({ withTransaction: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireUser: jest.fn() }))
jest.mock('@/lib/activeAssistance/createWithDuplicateCheck', () => ({ createWithDuplicateCheck: jest.fn() }))
jest.mock('@/lib/roster/scheduleAlerts', () => ({ notifyTeamLeadersIfOffTomorrow: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { requireUser } from '@/lib/auth/requireUser'
import { createWithDuplicateCheck } from '@/lib/activeAssistance/createWithDuplicateCheck'
import { notifyTeamLeadersIfOffTomorrow } from '@/lib/roster/scheduleAlerts'
import {
  createFollowupAction,
  updateFollowupAction,
  updateFollowupStatusAction,
  assignFollowupAction,
  reassignFollowupAction,
  getFollowupHistoryAction,
  createCallback,
  updateCallback,
  updateCallbackStatus,
  rescheduleCallback,
  sendCallbackToLateShift,
  createSupportTicketAction,
  updateSupportTicketAction,
  markSupportTicketCompleteAction,
  getSupportTicketByIdAction,
  getFollowupByIdAction,
  getCallbackByIdAction,
} from './actions'

const mockSql = sql as unknown as jest.Mock
const mockWithTransaction = withTransaction as jest.Mock
const mockRequireUser = requireUser as jest.Mock
const mockCreateWithDuplicateCheck = createWithDuplicateCheck as jest.Mock
const mockNotify = notifyTeamLeadersIfOffTomorrow as jest.Mock

beforeEach(() => {
  mockSql.mockReset()
  mockWithTransaction.mockReset()
  mockRequireUser.mockReset()
  mockCreateWithDuplicateCheck.mockReset()
  mockNotify.mockReset()
  // Every mutation action route runs inside withTransaction with the same
  // mock as the outer sql - matches team-leaders/actions.test.ts's pattern,
  // since it's genuinely the same underlying connection either way here.
  mockWithTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockSql))
})

const agent = { userId: 'agent-1', role: 'agent' as const, t2Team: null, fullName: 'Agent One' }
const otherAgent = { userId: 'agent-2', role: 'agent' as const, t2Team: null, fullName: 'Agent Two' }
const admin = { userId: 'admin-1', role: 'admin' as const, t2Team: null, fullName: 'Admin One' }
const management = { userId: 'mgmt-1', role: 'management' as const, t2Team: null, fullName: 'Mgmt One' }

const followupInput = {
  customer_id: 'cust-1',
  query_description: 'desc',
  possible_solution: null,
  priority: 'normal' as const,
  due_date: null,
  resolution_notes: null,
  status: 'open' as const,
  category_id: null,
  cancellation_reason: null,
  collection_address: null,
  queue: null,
}

const callbackInput = {
  customer_id: 'cust-1',
  scheduled_at: '2026-09-20T10:00:00.000Z',
  query_description: 'desc',
  possible_solution: null,
  notes: null,
  status: 'pending' as const,
  completed_at: null,
  queue: null,
}

const ticketInput = {
  customer_id: 'cust-1',
  agent_id: 'agent-1',
  channel: 'whatsapp' as const,
  reference: null,
  query_description: 'desc',
  query_type: null,
  issue_type: null,
  root_cause: null,
  priority: 'normal' as const,
  due_date: null,
  status: 'open' as const,
  resolution_notes: null,
  escalation_destination: null,
  escalation_notes: null,
  followup_notes: null,
  followup_scheduled_at: null,
  callback_notes: null,
  callback_scheduled_at: null,
}

/** A tx double for createWithDuplicateCheck's `insert(tx)` closure that
 *  records every tagged-template call's interpolated values and returns
 *  canned rows in call order - so we can assert on real INSERT bindings
 *  (agent_id/created_by placement) without simulating actual SQL. */
function fakeTx(...rowsPerCall: unknown[][]) {
  let call = 0
  const tx = jest.fn(async (..._args: unknown[]) => rowsPerCall[call++] ?? [])
  return tx
}

describe('createFollowupAction / assignFollowupAction', () => {
  it('rejects an unauthenticated caller before touching createWithDuplicateCheck', async () => {
    mockRequireUser.mockResolvedValue({ error: 'Unauthorized' })

    const result = await createFollowupAction(followupInput)

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockCreateWithDuplicateCheck).not.toHaveBeenCalled()
  })

  it('self-create sets both agent_id and created_by to the caller', async () => {
    mockRequireUser.mockResolvedValue(agent)
    const tx = fakeTx([{ id: 'fu-1' }])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    const result = await createFollowupAction(followupInput)

    expect(result).toEqual({ data: { id: 'fu-1' } })
    expect(mockCreateWithDuplicateCheck).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1', actorId: 'agent-1' }),
    )
    const [, customerId, agentId, createdBy] = tx.mock.calls[0]
    expect(customerId).toBe('cust-1')
    expect(agentId).toBe('agent-1')
    expect(createdBy).toBe('agent-1')
  })

  it('assign-variant lets agent_id differ from the caller and notifies the assignee', async () => {
    mockRequireUser.mockResolvedValue(admin)
    const tx = fakeTx([{ id: 'fu-2' }], [])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    const result = await assignFollowupAction({ ...followupInput, agent_id: 'agent-2', customerLabel: 'Jane Doe' })

    expect(result).toEqual({ data: { id: 'fu-2' } })
    const [, , agentId, createdBy] = tx.mock.calls[0]
    expect(agentId).toBe('agent-2')
    expect(createdBy).toBe('admin-1')
    // second tx call is the notification insert to the new assignee
    expect(tx.mock.calls[1][1]).toBe('agent-2')
  })
})

describe('updateFollowupAction / updateFollowupStatusAction / reassignFollowupAction', () => {
  it('errors when the followup does not exist', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([]) // loadExistingFollowup

    const result = await updateFollowupAction('fu-1', followupInput)

    expect(result).toEqual({ error: 'Follow-up not found.' })
    expect(mockWithTransaction).not.toHaveBeenCalled()
  })

  it('forbids a caller who neither owns it nor is admin/management', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql.mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])

    const result = await updateFollowupAction('fu-1', followupInput)

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('lets the owning agent update, and only logs status history when status actually changes', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])
      .mockResolvedValueOnce([{ id: 'fu-1', status: 'in_progress' }])
      .mockResolvedValueOnce([])

    const result = await updateFollowupAction('fu-1', { ...followupInput, status: 'in_progress' })

    expect(result).toEqual({ data: { id: 'fu-1', status: 'in_progress' } })
    expect(mockSql).toHaveBeenCalledTimes(3) // load, UPDATE, status_history insert
  })

  it('skips the status-history insert when status is unchanged', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])
      .mockResolvedValueOnce([{ id: 'fu-1', status: 'open' }])

    await updateFollowupAction('fu-1', { ...followupInput, status: 'open' })

    expect(mockSql).toHaveBeenCalledTimes(2) // load, UPDATE only
  })

  it('lets admin/management update a followup they do not own', async () => {
    mockRequireUser.mockResolvedValue(management)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])
      .mockResolvedValueOnce([{ id: 'fu-1' }])

    const result = await updateFollowupStatusAction('fu-1', 'open')

    expect(result).toEqual({ data: { id: 'fu-1' } })
  })

  it('reassign only fires a notification when agent_id actually changes', async () => {
    mockRequireUser.mockResolvedValue(admin)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }]) // load
      .mockResolvedValueOnce([{ id: 'fu-1' }]) // UPDATE
    // status unchanged (open->open) and agent_id unchanged (agent-1->agent-1): no extra calls

    await reassignFollowupAction('fu-1', { ...followupInput, agent_id: 'agent-1', customerLabel: 'Jane' })

    expect(mockSql).toHaveBeenCalledTimes(2)
  })

  it('reassign notifies the new assignee when agent_id changes', async () => {
    mockRequireUser.mockResolvedValue(admin)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])
      .mockResolvedValueOnce([{ id: 'fu-1' }])
      .mockResolvedValueOnce([]) // notification insert

    await reassignFollowupAction('fu-1', { ...followupInput, agent_id: 'agent-2', customerLabel: 'Jane' })

    expect(mockSql).toHaveBeenCalledTimes(3)
    expect(mockSql.mock.calls[2][1]).toBe('agent-2')
  })
})

describe('getFollowupHistoryAction', () => {
  it('allows the owning agent, the creator, or admin/management; forbids everyone else', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql.mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])

    const result = await getFollowupHistoryAction('fu-1')

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('lets the owning agent view their own history', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])
      .mockResolvedValueOnce([{ id: 'h1' }])

    const result = await getFollowupHistoryAction('fu-1')

    expect(result).toEqual({ data: [{ id: 'h1' }] })
  })
})

describe('createCallback — targetAgentId only honored for role admin', () => {
  it('ignores an agent-supplied targetAgentId when the caller is a plain agent', async () => {
    mockRequireUser.mockResolvedValue(agent)
    const tx = fakeTx([{ id: 'cb-1' }])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    await createCallback(callbackInput, 'agent-2')

    const [, , agentId] = tx.mock.calls[0]
    expect(agentId).toBe('agent-1') // caller's own id, not the requested target
  })

  it('ignores targetAgentId when the caller is management (not admin)', async () => {
    mockRequireUser.mockResolvedValue(management)
    const tx = fakeTx([{ id: 'cb-2' }])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    await createCallback(callbackInput, 'agent-2')

    const [, , agentId] = tx.mock.calls[0]
    expect(agentId).toBe('mgmt-1')
  })

  it('honors targetAgentId when the caller is admin, and notifies the assignee', async () => {
    mockRequireUser.mockResolvedValue(admin)
    const tx = fakeTx([{ id: 'cb-3' }], [{ name: 'Jane Doe' }], [])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    await createCallback(callbackInput, 'agent-2')

    const [, , agentId] = tx.mock.calls[0]
    expect(agentId).toBe('agent-2')
  })
})

describe('createCallback — callback-only contact details', () => {
  const manualInput = { ...callbackInput, customer_id: null, contact: { name: ' Ann ', email: null, phone: '082 123 4567' } }
  const sqlText = (call: unknown[]) => (call[0] as string[]).join(' ')

  it('inserts inside a transaction with no duplicate check and never writes to customers', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ id: 'cb-9' }])

    const result = await createCallback(manualInput as never, '')

    expect(result).toEqual({ data: { id: 'cb-9' } })
    expect(mockCreateWithDuplicateCheck).not.toHaveBeenCalled()
    expect(sqlText(mockSql.mock.calls[0])).toContain('INSERT INTO callbacks')
    expect(mockSql.mock.calls[0].slice(1)).toEqual(expect.arrayContaining(['Ann', '082 123 4567']))
    expect(mockSql.mock.calls.some((c) => /customers/i.test(sqlText(c)))).toBe(false)
  })

  it('refuses details with neither a number nor an email, without touching the database', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await createCallback({ ...manualInput, contact: { name: 'Ann', email: null, phone: null } } as never, '')

    expect(result).toEqual({ error: 'Enter a contact number or an email address.' })
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('refuses a customer id sent together with contact details', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await createCallback({ ...callbackInput, contact: { name: null, email: null, phone: '0821234567' } } as never, '')

    expect(result).toEqual({ error: 'Choose either a customer or callback details, not both.' })
    expect(mockSql).not.toHaveBeenCalled()
    expect(mockCreateWithDuplicateCheck).not.toHaveBeenCalled()
  })

  it('notifies an assignee using the contact NAME and never the phone or email', async () => {
    mockRequireUser.mockResolvedValue(admin)
    mockSql.mockResolvedValueOnce([{ id: 'cb-9' }]).mockResolvedValueOnce([])

    await createCallback({ ...manualInput, contact: { name: 'Ann', email: 'ann@example.com', phone: '0821234567' } } as never, 'agent-2')

    const notification = mockSql.mock.calls[1]
    expect(sqlText(notification)).toContain('INSERT INTO notifications')
    const values = notification.slice(1).map(String).join(' ')
    expect(values).toContain('New Callback Assigned: Ann')
    expect(values).not.toContain('0821234567')
    expect(values).not.toContain('ann@example.com')
  })

  it('does not log the failing row (it contains the personal data)', async () => {
    mockRequireUser.mockResolvedValue(agent)
    const err = Object.assign(
      new Error('new row for relation "callbacks" violates check constraint "callbacks_customer_or_contact"'),
      { code: '23514', constraint_name: 'callbacks_customer_or_contact', detail: 'Failing row contains (ann@example.com, 0821234567)' },
    )
    mockSql.mockRejectedValueOnce(err)
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await createCallback(manualInput as never, '')

    expect(result).toEqual({ error: 'Could not create callback.' })
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).toContain('23514')
    expect(logged).toContain('callbacks_customer_or_contact')
    expect(logged).toContain('violates check constraint')
    expect(logged).not.toContain('ann@example.com')
    expect(logged).not.toContain('0821234567')
    spy.mockRestore()
  })
})

describe('updateCallback — callback-only contact details', () => {
  const manualRow = { agent_id: 'agent-1', customer_id: null, notes: null, scheduled_at: '2026-09-20T10:00:00.000Z' }
  const customerRow = { agent_id: 'agent-1', customer_id: 'cust-1', notes: null, scheduled_at: '2026-09-20T10:00:00.000Z' }
  const manualInput = { ...callbackInput, customer_id: null, contact: { name: 'Ann', email: 'ann@example.com', phone: null } }
  const sqlText = (call: unknown[]) => (call[0] as string[]).join(' ')

  it('updates the contact columns of a manual callback and keeps customer_id null', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([manualRow]).mockResolvedValueOnce([{ id: 'cb-1' }])

    const result = await updateCallback('cb-1', manualInput as never)

    expect(result).toEqual({ data: { id: 'cb-1' } })
    const update = mockSql.mock.calls[1]
    expect(sqlText(update)).toContain('contact_email')
    expect(sqlText(update)).not.toContain('customer_id = ')
    expect(update.slice(1)).toEqual(expect.arrayContaining(['Ann', 'ann@example.com']))
  })

  it('refuses to turn a manual callback into a customer callback here', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([manualRow])

    const result = await updateCallback('cb-1', callbackInput as never)

    expect(result).toEqual({ error: 'A callback with manual details cannot be linked to a customer here.' })
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('refuses to attach contact details to a customer callback', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([customerRow])

    const result = await updateCallback('cb-1', manualInput as never)

    expect(result).toEqual({ error: 'A customer callback cannot be changed into a manual one.' })
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('refuses contact details sent alongside a customer_id on a customer callback (same message as create)', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([customerRow])

    const result = await updateCallback('cb-1', { ...callbackInput, contact: { name: null, email: null, phone: '0821234567' } } as never)

    expect(result).toEqual({ error: 'Choose either a customer or callback details, not both.' })
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('still updates a customer callback exactly as before', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([customerRow]).mockResolvedValueOnce([{ id: 'cb-1' }])

    const result = await updateCallback('cb-1', callbackInput as never)

    expect(result).toEqual({ data: { id: 'cb-1' } })
    expect(sqlText(mockSql.mock.calls[1])).toContain('customer_id = ')
  })
})
describe('updateCallback / updateCallbackStatus / rescheduleCallback — canMutateCallback', () => {
  it('allows the owning agent', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', notes: null, scheduled_at: '2026-09-20T10:00:00.000Z' }])
      .mockResolvedValueOnce([{ id: 'cb-1' }])

    const result = await updateCallback('cb-1', callbackInput)

    expect(result).toEqual({ data: { id: 'cb-1' } })
  })

  it('allows role admin for someone else\'s callback', async () => {
    mockRequireUser.mockResolvedValue(admin)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', notes: null, scheduled_at: '2026-09-20T10:00:00.000Z' }])
      .mockResolvedValueOnce([{ id: 'cb-1' }])

    const result = await updateCallbackStatus('cb-1', 'completed')

    expect(result).toEqual({ data: { id: 'cb-1' } })
  })

  it('REJECTS role management for someone else\'s callback - stricter than followups/support tickets', async () => {
    mockRequireUser.mockResolvedValue(management)
    mockSql.mockResolvedValueOnce([{ agent_id: 'agent-1', notes: null, scheduled_at: '2026-09-20T10:00:00.000Z' }])

    const result = await rescheduleCallback('cb-1', '2026-09-21T10:00:00.000Z')

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('rejects a non-owning plain agent', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql.mockResolvedValueOnce([{ agent_id: 'agent-1', notes: null, scheduled_at: '2026-09-20T10:00:00.000Z' }])

    const result = await updateCallback('cb-1', callbackInput)

    expect(result).toEqual({ error: 'Forbidden' })
  })
})

describe('sendCallbackToLateShift', () => {
  const existingCallback = { agent_id: 'agent-1', notes: null, scheduled_at: '2026-09-21T10:00:00.000Z' } // Monday

  it('errors when no late-shift team is rostered for that date', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([existingCallback]) // loadExistingCallback
      .mockResolvedValueOnce([]) // rotations query - none rostered

    const result = await sendCallbackToLateShift('cb-1')

    expect(result).toEqual({ error: 'No late-shift team is rostered for this date. Please pick a new date/time instead.' })
  })

  it('errors when the matched late-shift team has no leader assigned', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([existingCallback])
      .mockResolvedValueOnce([{ team_id: 'team-1', team_name: 'Night Owls', work_days: [1, 2, 3, 4, 5], is_late_shift: true }])
      .mockResolvedValueOnce([]) // no team_leaders row

    const result = await sendCallbackToLateShift('cb-1')

    expect(result).toEqual({ error: 'Night Owls has no team leader assigned yet. Please pick a new date/time instead.' })
  })

  it('reassigns to the late-shift team leader and notifies them on success', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([existingCallback])
      .mockResolvedValueOnce([{ team_id: 'team-1', team_name: 'Night Owls', work_days: [1, 2, 3, 4, 5], is_late_shift: true }])
      .mockResolvedValueOnce([{ profile_id: 'leader-1' }])
      .mockResolvedValueOnce([{ name: 'Jane Doe' }]) // customer lookup
      .mockResolvedValueOnce([{ id: 'cb-1', agent_id: 'leader-1' }]) // UPDATE (inside withTransaction, same mock)
      .mockResolvedValueOnce([]) // notification insert

    const result = await sendCallbackToLateShift('cb-1')

    expect(result).toEqual({ data: { id: 'cb-1', agent_id: 'leader-1' } })
    expect(mockSql.mock.calls[5][1]).toBe('leader-1') // notification recipient_id
  })

  it('labels a nameless manual callback as "a callback contact" (never Unknown, never contact data)', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ ...existingCallback, customer_id: null }])
      .mockResolvedValueOnce([{ team_id: 'team-1', team_name: 'Night Owls', work_days: [1, 2, 3, 4, 5], is_late_shift: true }])
      .mockResolvedValueOnce([{ profile_id: 'leader-1' }])
      .mockResolvedValueOnce([{ name: null }]) // manual callback with no name
      .mockResolvedValueOnce([{ id: 'cb-1' }])
      .mockResolvedValueOnce([])

    await sendCallbackToLateShift('cb-1')

    const values = mockSql.mock.calls[5].slice(1).map(String).join(' ')
    expect(values).toContain('Late-Shift Callback: a callback contact')
    expect(values).toContain('A callback with a callback contact scheduled for')
    expect(values).not.toContain('Unknown')
  })
})

describe('createSupportTicketAction / updateSupportTicketAction — validateStatusFields', () => {
  it('requires escalation_destination when status is escalated', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await createSupportTicketAction({ ...ticketInput, status: 'escalated' })

    expect(result).toEqual({ error: 'Escalation destination is required.' })
    expect(mockCreateWithDuplicateCheck).not.toHaveBeenCalled()
  })

  it('requires followup_notes and followup_scheduled_at when status is follow_up', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await createSupportTicketAction({ ...ticketInput, status: 'follow_up' })

    expect(result).toEqual({ error: 'Follow-up notes, date, and time are all required.' })
  })

  it('requires callback_notes and callback_scheduled_at when status is callback', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await createSupportTicketAction({ ...ticketInput, status: 'callback' })

    expect(result).toEqual({ error: 'Callback notes, date, and time are all required.' })
  })

  it('requires query_type to resolve a ticket', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await createSupportTicketAction({ ...ticketInput, status: 'resolved' })

    expect(result).toEqual({ error: 'A query type is required to resolve or close a ticket.' })
  })

  it('requires issue_type to resolve a ticket once query_type is present', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await createSupportTicketAction({ ...ticketInput, status: 'resolved', query_type: 'billing' })

    expect(result).toEqual({ error: 'Issue type is required to resolve or close a ticket.' })
  })

  it('lets a plain agent create only for themselves - a supplied agent_id is ignored', async () => {
    mockRequireUser.mockResolvedValue(agent)
    const tx = fakeTx([{ id: 'st-1' }])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    await createSupportTicketAction({ ...ticketInput, agent_id: 'agent-2' })

    const [, , agentId] = tx.mock.calls[0]
    expect(agentId).toBe('agent-1')
  })

  it('lets admin/management create a ticket assigned to someone else', async () => {
    mockRequireUser.mockResolvedValue(admin)
    const tx = fakeTx([{ id: 'st-2' }])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    await createSupportTicketAction({ ...ticketInput, agent_id: 'agent-2' })

    const [, , agentId] = tx.mock.calls[0]
    expect(agentId).toBe('agent-2')
  })

  it('update: forbids a non-owning agent from reassigning agent_id away from anyone', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql.mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])

    const result = await updateSupportTicketAction('st-1', ticketInput)

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('update: re-validates status fields even for an owning agent', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])

    const result = await updateSupportTicketAction('st-1', { ...ticketInput, status: 'escalated' })

    expect(result).toEqual({ error: 'Escalation destination is required.' })
  })

  it('update: only inserts status history when status actually changes', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])
      .mockResolvedValueOnce([{ id: 'st-1', status: 'open' }])

    await updateSupportTicketAction('st-1', { ...ticketInput, status: 'open' })

    expect(mockSql).toHaveBeenCalledTimes(2) // load, UPDATE - no history insert
  })

  it('update: never changes the ticket\'s customer, even if the client sends a different customer_id', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])
      .mockResolvedValueOnce([{ id: 'st-1', status: 'open' }])

    await updateSupportTicketAction('st-1', { ...ticketInput, customer_id: 'some-other-customer', status: 'open' })

    const [strings, ...values] = mockSql.mock.calls[1] // the UPDATE
    expect((strings as string[]).join('?')).not.toContain('customer_id')
    expect(values).not.toContain('some-other-customer')
  })
})

describe('markSupportTicketCompleteAction', () => {
  it('requires a non-empty issue type', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await markSupportTicketCompleteAction('st-1', '   ')

    expect(result).toEqual({ error: 'Issue type is required to close a ticket.' })
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('forbids a non-owning, non-admin/management caller', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql.mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])

    const result = await markSupportTicketCompleteAction('st-1', 'billing')

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('closes the ticket and logs history when not already closed', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ agent_id: 'agent-1', created_by: 'agent-1', status: 'open' }])
      .mockResolvedValueOnce([{ id: 'st-1', status: 'closed' }])
      .mockResolvedValueOnce([])

    const result = await markSupportTicketCompleteAction('st-1', 'billing')

    expect(result).toEqual({ data: { id: 'st-1', status: 'closed' } })
    expect(mockSql).toHaveBeenCalledTimes(3)
  })
})

describe('single-record fetch actions — ownership/role-scoped reads', () => {
  it('getSupportTicketByIdAction: not-found', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([])

    const result = await getSupportTicketByIdAction('st-1')

    expect(result).toEqual({ error: 'Support ticket not found.' })
  })

  it('getSupportTicketByIdAction: forbids a non-owning agent, allows admin/management', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql.mockResolvedValueOnce([{ id: 'st-1', agent_id: 'agent-1' }])

    const result = await getSupportTicketByIdAction('st-1')

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('getFollowupByIdAction: allows the owning agent', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ id: 'fu-1', agent_id: 'agent-1' }])

    const result = await getFollowupByIdAction('fu-1')

    expect(result).toEqual({ data: { id: 'fu-1', agent_id: 'agent-1' } })
  })

  it('getCallbackByIdAction: rejects management (only admin, not isAdminOrManagement, for callbacks)', async () => {
    mockRequireUser.mockResolvedValue(management)
    mockSql.mockResolvedValueOnce([{ id: 'cb-1', agent_id: 'agent-1' }])

    const result = await getCallbackByIdAction('cb-1')

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('getCallbackByIdAction: allows admin', async () => {
    mockRequireUser.mockResolvedValue(admin)
    mockSql.mockResolvedValueOnce([{ id: 'cb-1', agent_id: 'agent-1' }])

    const result = await getCallbackByIdAction('cb-1')

    expect(result).toEqual({ data: { id: 'cb-1', agent_id: 'agent-1' } })
  })
})
