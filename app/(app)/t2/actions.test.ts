jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/db/tx', () => ({ withTransaction: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireUser: jest.fn() }))
jest.mock('@/lib/activeAssistance/createWithDuplicateCheck', () => ({ createWithDuplicateCheck: jest.fn() }))
jest.mock('@/lib/activeAssistance/getActiveAssistance', () => ({ getActiveAssistanceForCustomer: jest.fn().mockResolvedValue([]) }))

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { requireUser } from '@/lib/auth/requireUser'
import { createWithDuplicateCheck } from '@/lib/activeAssistance/createWithDuplicateCheck'
import {
  createTicketAction,
  createBillingTicketAction,
  getBillingTicketByIdAction,
  updateBillingTicketStatusAction,
  getTicketModalDataAction,
  updateDiagnosticsAction,
  addTicketNoteAction,
  solveTicketAction,
  escalateTicketAction,
  acknowledgeEscalationAction,
  respondEscalationAction,
  validateEscalationAction,
  reassignCallbackTicketAction,
  reviewSolutionAction,
  closeTicketAction,
} from './actions'

const mockSql = sql as unknown as jest.Mock
const mockWithTransaction = withTransaction as jest.Mock
const mockRequireUser = requireUser as jest.Mock
const mockCreateWithDuplicateCheck = createWithDuplicateCheck as jest.Mock

beforeEach(() => {
  mockSql.mockReset()
  mockWithTransaction.mockReset()
  mockRequireUser.mockReset()
  mockCreateWithDuplicateCheck.mockReset()
  mockWithTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockSql))
})

const agent = { userId: 'agent-1', role: 'agent' as const, t2Team: null, fullName: 'Agent One' }
const otherAgent = { userId: 'agent-2', role: 'agent' as const, t2Team: null, fullName: 'Agent Two' }
const teamLeader = { userId: 'tl-1', role: 'team_leader' as const, t2Team: null, fullName: 'TL One' }
const management = { userId: 'mgmt-1', role: 'management' as const, t2Team: null, fullName: 'Mgmt One' }
const billingAgent = { userId: 'agent-3', role: 'agent' as const, t2Team: null, fullName: 'Billing Agent' }
const t3Voice = { userId: 't3-1', role: 't3' as const, t2Team: 'Voice', fullName: 'T3 Voice' }
const t3Core = { userId: 't3-2', role: 't3' as const, t2Team: 'Core', fullName: 'T3 Core' }

const baseTicketInput = {
  customer_id: 'cust-1',
  queue: 'ADVANCED',
  issue_type: 'Slow speed',
  description: 'desc',
  address: null, plus_code: null, imsi: null, msisdn: null, customer_email: null,
  regular_site: null, provisioning_status: null, project: null, root_cause: null,
  rsrp: null, rsrq: null, sinr: null, serving_site: null, connected_site: null,
  band: null, network_technology: null, download_speed: null, upload_speed: null, latency: null,
  device: null, escalation_path: null, outcome: null,
  sim_type: null, swap_reason: null, swap_requested_date: null, swap_processed: null, station_ticket_number: null,
  port_in: null, port_customer_experiencing_issues: null, port_issue_type: null, port_inquiry_type: null,
  port_reversal_reason: null, donor_isp: null,
}

function fakeTx(...rowsPerCall: unknown[][]) {
  let call = 0
  return jest.fn(async (..._args: unknown[]) => rowsPerCall[call++] ?? [])
}

describe('createTicketAction', () => {
  it('rejects a role that is neither agent nor team_leader', async () => {
    mockRequireUser.mockResolvedValue(management)

    const result = await createTicketAction(baseTicketInput)

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('requires customer_id and a valid queue', async () => {
    mockRequireUser.mockResolvedValue(agent)

    expect(await createTicketAction({ ...baseTicketInput, customer_id: '' })).toEqual({ error: 'customer_id is required' })
    expect(await createTicketAction({ ...baseTicketInput, queue: 'NOT_A_QUEUE' })).toEqual(
      expect.objectContaining({ error: expect.stringContaining('queue must be one of') }),
    )
  })

  it('SIM SWAP: requires a valid sim_type, swap_reason, and swap_requested_date', async () => {
    mockRequireUser.mockResolvedValue(agent)
    const input = { ...baseTicketInput, queue: 'SIM SWAP', issue_type: null }

    expect(await createTicketAction({ ...input, sim_type: 'not a real type' })).toEqual(
      expect.objectContaining({ error: expect.stringContaining('sim_type must be one of') }),
    )
    expect(await createTicketAction({ ...input, sim_type: '4G Mobile sim swap' })).toEqual({ error: 'swap_reason is required' })
    expect(await createTicketAction({ ...input, sim_type: '4G Mobile sim swap', swap_reason: 'lost' })).toEqual({
      error: 'swap_requested_date is required',
    })
  })

  it('PORTING (port_in=Yes): requires port_customer_experiencing_issues, then port_issue_type if Yes', async () => {
    mockRequireUser.mockResolvedValue(agent)
    const input = { ...baseTicketInput, queue: 'PORTING', issue_type: null }

    expect(await createTicketAction({ ...input, port_in: 'Yes' })).toEqual({ error: 'port_customer_experiencing_issues is required' })
    expect(await createTicketAction({ ...input, port_in: 'Yes', port_customer_experiencing_issues: 'Yes' })).toEqual({
      error: 'port_issue_type is required',
    })
  })

  it('PORTING (port_in=No): requires port_inquiry_type, then port_reversal_reason if Port reversal', async () => {
    mockRequireUser.mockResolvedValue(agent)
    const input = { ...baseTicketInput, queue: 'PORTING', issue_type: null }

    expect(await createTicketAction({ ...input, port_in: 'No' })).toEqual({ error: 'port_inquiry_type is required' })
    expect(await createTicketAction({ ...input, port_in: 'No', port_inquiry_type: 'Port reversal' })).toEqual({
      error: 'port_reversal_reason is required',
    })
  })

  it('requires issue_type for a non-SIM-SWAP, non-PORTING queue', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await createTicketAction({ ...baseTicketInput, queue: 'ADVANCED', issue_type: null })

    expect(result).toEqual({ error: 'issue_type is required' })
  })

  it('creates the ticket with a T2-prefixed ticket number and logs a created event', async () => {
    mockRequireUser.mockResolvedValue(agent)
    const tx = fakeTx([{ n: '42' }], [{ id: 'ticket-1' }], [])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    const result = await createTicketAction(baseTicketInput)

    expect(result).toEqual({ data: { id: 'ticket-1', ticket_number: 'T2-42' } })
    expect(tx).toHaveBeenCalledTimes(3) // nextval, INSERT tickets, INSERT ticket_events
  })

  it('SIM SWAP success: auto-fills issue_type to "SIM Swap Request" regardless of input.issue_type', async () => {
    mockRequireUser.mockResolvedValue(agent)
    const tx = fakeTx([{ n: '1' }], [{ id: 'ticket-2' }], [])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    await createTicketAction({
      ...baseTicketInput, queue: 'SIM SWAP', issue_type: null,
      sim_type: '4G Mobile sim swap', swap_reason: 'lost', swap_requested_date: '2026-09-20',
    })

    // INSERT tickets is tx's 2nd call; values bind in order ticketNumber(1), customer_id(2), queue(3), issue_type(4).
    const insertCallArgs = tx.mock.calls[1]
    expect(insertCallArgs[4]).toBe('SIM Swap Request')
  })

  it('assigns the new ticket to whoever raised it, so it never lists as Unassigned', async () => {
    mockRequireUser.mockResolvedValue(agent)
    const tx = fakeTx([{ n: '43' }], [{ id: 'ticket-3' }], [])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    await createTicketAction(baseTicketInput)

    const [strings, ...values] = tx.mock.calls[1] as [string[], ...unknown[]]
    expect(strings.join('')).toContain('assigned_to')
    // The creator's id binds twice - once as created_by, once as assigned_to.
    expect(values.filter((v) => v === agent.userId)).toHaveLength(2)
  })
})

describe('createBillingTicketAction', () => {
  it('rejects a plain agent whose department is not Billing', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ department: 'Support' }])

    const result = await createBillingTicketAction({ customer_id: 'cust-1', channel: 'Stitch', reason_for_followup: 'Refund', amount: 100, description: null })

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('allows an agent whose department IS Billing', async () => {
    mockRequireUser.mockResolvedValue(billingAgent)
    mockSql.mockResolvedValueOnce([{ department: 'Billing' }])
    const tx = fakeTx([{ n: '5' }], [{ id: 'bt-1' }], [])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    const result = await createBillingTicketAction({ customer_id: 'cust-1', channel: 'Stitch', reason_for_followup: 'Refund', amount: 100, description: null })

    expect(result).toEqual({ data: { id: 'bt-1', ticket_number: 'T2-5' } })
  })

  it('rejects a non-agent role outside the admin/management/hod/team_leader tier', async () => {
    mockRequireUser.mockResolvedValue({ userId: 't3-1', role: 't3' as const, t2Team: 'Voice', fullName: 'T3' })

    const result = await createBillingTicketAction({ customer_id: 'cust-1', channel: 'Stitch', reason_for_followup: 'Refund', amount: 100, description: null })

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('requires amount > 0 when reason_for_followup needs an amount', async () => {
    mockRequireUser.mockResolvedValue(management)

    const result = await createBillingTicketAction({ customer_id: 'cust-1', channel: 'Stitch', reason_for_followup: 'Refund', amount: 0, description: null })

    expect(result).toEqual({ error: 'amount is required and must be greater than 0' })
  })

  it('rejects a supplied amount when the reason does not need one', async () => {
    mockRequireUser.mockResolvedValue(management)

    const result = await createBillingTicketAction({ customer_id: 'cust-1', channel: 'Stitch', reason_for_followup: 'Provisioning', amount: 50, description: null })

    expect(result).toEqual({ error: 'amount must not be set for this reason' })
  })

  it('starts a new billing ticket already in status escalated', async () => {
    mockRequireUser.mockResolvedValue(management)
    const tx = fakeTx([{ n: '9' }], [{ id: 'bt-2' }], [])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    await createBillingTicketAction({ customer_id: 'cust-1', channel: 'Stitch', reason_for_followup: 'Provisioning', amount: null, description: null })

    // 'escalated' is a literal in the SQL text (not a bound param), so it
    // lives in the strings array (the tagged template's first argument).
    const [strings] = tx.mock.calls[1] as [string[]]
    expect(strings.join('')).toContain(`'escalated'`)
  })

  it('assigns the new billing ticket to whoever raised it, so it never lists as Unassigned', async () => {
    mockRequireUser.mockResolvedValue(management)
    const tx = fakeTx([{ n: '10' }], [{ id: 'bt-3' }], [])
    mockCreateWithDuplicateCheck.mockImplementation(async ({ insert }) => {
      const { row } = await insert(tx)
      return { data: row }
    })

    await createBillingTicketAction({ customer_id: 'cust-1', channel: 'Stitch', reason_for_followup: 'Provisioning', amount: null, description: null })

    const [strings, ...values] = tx.mock.calls[1] as [string[], ...unknown[]]
    expect(strings.join('')).toContain('assigned_to')
    expect(values.filter((v) => v === management.userId)).toHaveLength(2)
  })
})

describe('getBillingTicketByIdAction / updateBillingTicketStatusAction', () => {
  it('getBillingTicketByIdAction: not-found', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([])

    const result = await getBillingTicketByIdAction('bt-1')

    expect(result).toEqual({ error: 'Billing ticket not found.' })
  })

  it('getBillingTicketByIdAction: forbids a non-owning agent', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql
      .mockResolvedValueOnce([{ id: 'bt-1', ticket_number: 'T2-1' }]) // billing summary row
      .mockResolvedValueOnce([{ id: 'bt-1', status: 'escalated', created_by: 'agent-1', assigned_to: null, escalation_destination: null }]) // loadTicket

    const result = await getBillingTicketByIdAction('bt-1')

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('updateBillingTicketStatusAction: rejects a status outside the selectable set', async () => {
    mockRequireUser.mockResolvedValue(billingAgent)

    const result = await updateBillingTicketStatusAction('bt-1', 'open' as never)

    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining('status must be one of') }))
  })

  it('updateBillingTicketStatusAction: re-escalating without an escalation path is rejected', async () => {
    mockRequireUser.mockResolvedValue(billingAgent)

    const result = await updateBillingTicketStatusAction('bt-1', 'escalated')

    expect(result).toEqual({ error: 'Escalation path (channel) is required when re-escalating.' })
  })

  it('updateBillingTicketStatusAction: re-escalating with an escalation path updates status and channel', async () => {
    mockRequireUser.mockResolvedValue(billingAgent)
    mockSql.mockResolvedValueOnce([{ id: 'bt-1', status: 'follow_up', created_by: 'agent-3', assigned_to: null, escalation_destination: null }])

    const result = await updateBillingTicketStatusAction('bt-1', 'escalated', 'Receivables')

    expect(result).toEqual({ data: true })
    expect(mockWithTransaction).toHaveBeenCalledTimes(1)
  })

  it('updateBillingTicketStatusAction: not-yours error for a non-owning agent', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql.mockResolvedValueOnce([{ id: 'bt-1', status: 'escalated', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await updateBillingTicketStatusAction('bt-1', 'follow_up')

    expect(result).toEqual({ error: 'This ticket is not yours' })
  })

  it('updateBillingTicketStatusAction: resolved sets resolved_at via the transaction path', async () => {
    mockRequireUser.mockResolvedValue(billingAgent)
    mockSql.mockResolvedValueOnce([{ id: 'bt-1', status: 'escalated', created_by: 'agent-3', assigned_to: null, escalation_destination: null }])

    const result = await updateBillingTicketStatusAction('bt-1', 'resolved')

    expect(result).toEqual({ data: true })
    expect(mockWithTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('getTicketModalDataAction', () => {
  it('not-found when the ticket does not exist at all', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([])

    const result = await getTicketModalDataAction('t-1')

    expect(result).toEqual({ error: 'Ticket not found' })
  })

  it('forbids a plain agent who neither created nor is assigned the ticket', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql
      .mockResolvedValueOnce([{ queue: 'ADVANCED' }]) // queue lookup
      .mockResolvedValueOnce([{ id: 't-1', created_by: 'agent-1', assigned_to: null }]) // ticket fetch

    const result = await getTicketModalDataAction('t-1')

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('routes a BILLING-queue ticket through getBillingTicketByIdAction', async () => {
    mockRequireUser.mockResolvedValue(billingAgent)
    mockSql
      .mockResolvedValueOnce([{ queue: 'BILLING' }]) // queue lookup
      .mockResolvedValueOnce([{ id: 'bt-1', ticket_number: 'T2-1' }]) // billing summary
      .mockResolvedValueOnce([{ id: 'bt-1', status: 'escalated', created_by: 'agent-3', assigned_to: null, escalation_destination: null }]) // loadTicket
      .mockResolvedValueOnce([]) // events

    const result = await getTicketModalDataAction('bt-1')

    expect(result.data?.kind).toBe('billing')
  })
})

describe('updateDiagnosticsAction', () => {
  it('rejects a role outside agent/team_leader/t3', async () => {
    mockRequireUser.mockResolvedValue(management)

    const result = await updateDiagnosticsAction('t-1', {} as never)

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('rejects a t3 caller whose team does not match the ticket\'s escalation_destination', async () => {
    mockRequireUser.mockResolvedValue(t3Voice)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'in_progress', created_by: 'agent-1', assigned_to: null, escalation_destination: 'Core' }])

    const result = await updateDiagnosticsAction('t-1', {} as never)

    expect(result).toEqual({ error: 'Ticket is not routed to your team' })
  })

  it('rejects editing diagnostics once the ticket is resolved/closed', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'resolved', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await updateDiagnosticsAction('t-1', {} as never)

    expect(result).toEqual({ error: 'Ticket is already resolved — diagnostics can no longer be edited' })
  })

  it('a matching t3 caller may update diagnostics without triggering maybeStartProgress', async () => {
    mockRequireUser.mockResolvedValue(t3Voice)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 'open', created_by: 'agent-1', assigned_to: null, escalation_destination: 'Voice' }])
      .mockResolvedValueOnce([]) // UPDATE diagnostics
      .mockResolvedValueOnce([]) // logEvent note

    const result = await updateDiagnosticsAction('t-1', {} as never)

    expect(result).toEqual({ data: true })
    expect(mockSql).toHaveBeenCalledTimes(3) // load, UPDATE, note - no status-flip UPDATE/log
  })

  it('an agent editing an OPEN ticket flips it to in_progress first (maybeStartProgress)', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 'open', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])
      .mockResolvedValueOnce([]) // maybeStartProgress UPDATE
      .mockResolvedValueOnce([]) // maybeStartProgress logEvent
      .mockResolvedValueOnce([]) // UPDATE diagnostics
      .mockResolvedValueOnce([]) // logEvent note

    await updateDiagnosticsAction('t-1', {} as never)

    expect(mockSql).toHaveBeenCalledTimes(5)
  })
})

describe('addTicketNoteAction', () => {
  it('rejects a caller who is not the ticket owner and not a non-agent role', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'in_progress', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await addTicketNoteAction('t-1', 'a note')

    expect(result).toEqual({ error: 'This ticket is not yours' })
  })

  it('a non-agent role (e.g. management) may always add a note, without triggering maybeStartProgress', async () => {
    mockRequireUser.mockResolvedValue(management)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 'open', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])
      .mockResolvedValueOnce([]) // logEvent note only

    const result = await addTicketNoteAction('t-1', 'a note')

    expect(result).toEqual({ data: true })
    expect(mockSql).toHaveBeenCalledTimes(2) // load + note - no maybeStartProgress for management
  })

  it('skips logging entirely when note is empty', async () => {
    mockRequireUser.mockResolvedValue(management)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'in_progress', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    await addTicketNoteAction('t-1', '')

    expect(mockSql).toHaveBeenCalledTimes(1) // load only
  })
})

describe('solveTicketAction', () => {
  it('rejects when the ticket has already been escalated or resolved', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'escalated', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await solveTicketAction('t-1', { troubleshooting_performed: 'x', findings: 'y', solution: 'z', outcome: 'resolved' })

    expect(result).toEqual({ error: 'Ticket has already been escalated or resolved' })
  })

  it('requires all four fields', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'open', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await solveTicketAction('t-1', { troubleshooting_performed: 'x', findings: '', solution: 'z', outcome: 'resolved' })

    expect(result).toEqual({ error: 'Troubleshooting performed, findings, solution, and outcome are all required to resolve a ticket' })
  })

  it('rejects an outcome outside SOLUTION_OUTCOMES', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'open', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await solveTicketAction('t-1', { troubleshooting_performed: 'x', findings: 'y', solution: 'z', outcome: 'not_a_real_outcome' })

    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining('outcome must be one of') }))
  })

  it('resolves the ticket and records the solution as pending Team Lead review', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 'open', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])
      .mockResolvedValueOnce([]) // UPDATE tickets resolved
      .mockResolvedValueOnce([]) // INSERT ticket_solutions
      .mockResolvedValueOnce([]) // logEvent solution

    const result = await solveTicketAction('t-1', { troubleshooting_performed: 'x', findings: 'y', solution: 'z', outcome: 'resolved' })

    expect(result).toEqual({ data: true })
  })
})

describe('escalateTicketAction', () => {
  it('requires escalate_to to be one of T3_ESCALATION_TEAMS', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'open', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await escalateTicketAction('t-1', { escalate_to: 'Not A Team', escalation_reason: 'why', technical_findings: null, troubleshooting_already_performed: null, regular_site: null, serving_site: null, station_reference_ticket: null, agent_notes: null, priority: 'medium' })

    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining('escalate_to must be one of') }))
  })

  it('rejects an invalid priority', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'open', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await escalateTicketAction('t-1', { escalate_to: 'Voice', escalation_reason: 'why', technical_findings: null, troubleshooting_already_performed: null, regular_site: null, serving_site: null, station_reference_ticket: null, agent_notes: null, priority: 'urgent-ish' })

    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining('priority must be one of') }))
  })

  it('escalates successfully, moving the ticket to escalated with the chosen destination', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 'in_progress', created_by: 'agent-1', assigned_to: null, escalation_destination: null }]) // load
      .mockResolvedValueOnce([{ c: '0' }]) // COUNT existing escalations
      .mockResolvedValueOnce([{ id: 'esc-1' }]) // INSERT ticket_escalations
      .mockResolvedValueOnce([]) // UPDATE tickets escalated
      .mockResolvedValueOnce([]) // logEvent escalated

    const result = await escalateTicketAction('t-1', { escalate_to: 'Voice', escalation_reason: 'why', technical_findings: null, troubleshooting_already_performed: null, regular_site: null, serving_site: null, station_reference_ticket: null, agent_notes: null, priority: 'medium' })

    expect(result).toEqual({ data: { escalationId: 'esc-1' } })
  })

  it('notes the attempt number in the log when this is a re-escalation', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 'in_progress', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])
      .mockResolvedValueOnce([{ c: '1' }]) // one prior escalation already exists
      .mockResolvedValueOnce([{ id: 'esc-2' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await escalateTicketAction('t-1', { escalate_to: 'Voice', escalation_reason: 'why', technical_findings: null, troubleshooting_already_performed: null, regular_site: null, serving_site: null, station_reference_ticket: null, agent_notes: null, priority: 'medium' })

    const logCallArgs = mockSql.mock.calls[4]
    expect(logCallArgs).toEqual(expect.arrayContaining([expect.stringContaining('attempt #2')]))
  })
})

describe('acknowledgeEscalationAction / respondEscalationAction — T3 team-routing and status preconditions', () => {
  it('rejects a non-t3 role outright', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await acknowledgeEscalationAction('t-1', 'esc-1')

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('rejects an escalation not routed to the caller\'s T3 team', async () => {
    mockRequireUser.mockResolvedValue(t3Voice)
    mockSql.mockResolvedValueOnce([{ id: 'esc-1', ticket_id: 't-1', escalate_to: 'Core', status: 'open', t3_response: null }])

    const result = await acknowledgeEscalationAction('t-1', 'esc-1')

    expect(result).toEqual({ error: 'This escalation is not routed to your team' })
  })

  it('rejects acknowledging an escalation that is not open', async () => {
    mockRequireUser.mockResolvedValue(t3Voice)
    mockSql.mockResolvedValueOnce([{ id: 'esc-1', ticket_id: 't-1', escalate_to: 'Voice', status: 'acknowledged', t3_response: null }])

    const result = await acknowledgeEscalationAction('t-1', 'esc-1')

    expect(result).toEqual({ error: 'Escalation is already acknowledged' })
  })

  it('acknowledges successfully and moves the ticket to awaiting_t3', async () => {
    mockRequireUser.mockResolvedValue(t3Voice)
    mockSql
      .mockResolvedValueOnce([{ id: 'esc-1', ticket_id: 't-1', escalate_to: 'Voice', status: 'open', t3_response: null }])
      .mockResolvedValueOnce([]) // UPDATE ticket_escalations
      .mockResolvedValueOnce([]) // UPDATE tickets awaiting_t3
      .mockResolvedValueOnce([]) // logEvent

    const result = await acknowledgeEscalationAction('t-1', 'esc-1')

    expect(result).toEqual({ data: true })
  })

  it('respondEscalationAction requires the escalation to already be acknowledged', async () => {
    mockRequireUser.mockResolvedValue(t3Voice)
    mockSql.mockResolvedValueOnce([{ id: 'esc-1', ticket_id: 't-1', escalate_to: 'Voice', status: 'open', t3_response: null }])

    const result = await respondEscalationAction('t-1', 'esc-1', 'here is the fix')

    expect(result).toEqual({ error: 'Acknowledge the escalation before submitting a response' })
  })

  it('a T3 agent from a different team cannot acknowledge/respond even with the right role', async () => {
    mockRequireUser.mockResolvedValue(t3Core)
    mockSql.mockResolvedValueOnce([{ id: 'esc-1', ticket_id: 't-1', escalate_to: 'Voice', status: 'acknowledged', t3_response: null }])

    const result = await respondEscalationAction('t-1', 'esc-1', 'fix')

    expect(result).toEqual({ error: 'This escalation is not routed to your team' })
  })
})

describe('validateEscalationAction', () => {
  it('requires the escalation to have a T3 response already', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 't3_responded', created_by: 'agent-1', assigned_to: null, escalation_destination: 'Voice' }]) // loadTicket
      .mockResolvedValueOnce([{ id: 'esc-1', ticket_id: 't-1', escalate_to: 'Voice', status: 'acknowledged', t3_response: null }]) // escalation lookup

    const result = await validateEscalationAction('t-1', 'esc-1', { result: 'resolved' })

    expect(result).toEqual({ error: 'This escalation has no T3 response to validate yet' })
  })

  it('rejected path: reopens the ticket to in_progress without requiring solution fields', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 't3_responded', created_by: 'agent-1', assigned_to: null, escalation_destination: 'Voice' }])
      .mockResolvedValueOnce([{ id: 'esc-1', ticket_id: 't-1', escalate_to: 'Voice', status: 'responded', t3_response: 'try this' }])
      .mockResolvedValueOnce([]) // UPDATE ticket_escalations rejected
      .mockResolvedValueOnce([]) // UPDATE tickets in_progress
      .mockResolvedValueOnce([]) // logEvent

    const result = await validateEscalationAction('t-1', 'esc-1', { result: 'rejected', note: 'did not fix it' })

    expect(result).toEqual({ data: true })
  })

  it('resolved path: requires troubleshooting_performed, findings, and a solution (or falls back to t3_response)', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 't3_responded', created_by: 'agent-1', assigned_to: null, escalation_destination: 'Voice' }])
      .mockResolvedValueOnce([{ id: 'esc-1', ticket_id: 't-1', escalate_to: 'Voice', status: 'responded', t3_response: 'try this' }])

    const result = await validateEscalationAction('t-1', 'esc-1', { result: 'resolved', findings: 'confirmed fix' })

    expect(result).toEqual({ error: 'Troubleshooting performed, findings, and a solution (or the T3 response) are required to validate a resolution' })
  })

  it('resolved path: succeeds using the T3 response as the solution when none is supplied, and closes the ticket out', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 't3_responded', created_by: 'agent-1', assigned_to: null, escalation_destination: 'Voice' }])
      .mockResolvedValueOnce([{ id: 'esc-1', ticket_id: 't-1', escalate_to: 'Voice', status: 'responded', t3_response: 'try this' }])
      .mockResolvedValueOnce([]) // UPDATE ticket_escalations validated
      .mockResolvedValueOnce([]) // UPDATE tickets resolved
      .mockResolvedValueOnce([]) // INSERT ticket_solutions
      .mockResolvedValueOnce([]) // logEvent solution
      .mockResolvedValueOnce([]) // logEvent resolved

    const result = await validateEscalationAction('t-1', 'esc-1', {
      result: 'resolved', troubleshooting_performed: 'checked config', findings: 'confirmed fix',
    })

    expect(result).toEqual({ data: true })
    const solutionInsertArgs = mockSql.mock.calls[4]
    expect(solutionInsertArgs).toContain('try this') // fell back to t3_response
  })
})

describe('reassignCallbackTicketAction', () => {
  it('rejects roles outside team_leader/management/hod', async () => {
    mockRequireUser.mockResolvedValue(agent)

    const result = await reassignCallbackTicketAction('t-1', 'agent-2')

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('only accepts reassignment of a callback-status ticket', async () => {
    mockRequireUser.mockResolvedValue(teamLeader)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'in_progress', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await reassignCallbackTicketAction('t-1', 'agent-2')

    expect(result).toEqual({ error: 'Only a callback-status ticket can be reassigned this way' })
  })

  it('rejects a target who is inactive or not an agent/team_leader', async () => {
    mockRequireUser.mockResolvedValue(teamLeader)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 'callback', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])
      .mockResolvedValueOnce([]) // no active agent found matching id+role

    const result = await reassignCallbackTicketAction('t-1', 'agent-2')

    expect(result).toEqual({ error: 'Agent not found' })
  })

  it('reassigns to a valid active agent and logs the handoff', async () => {
    mockRequireUser.mockResolvedValue(management)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 'callback', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])
      .mockResolvedValueOnce([{ id: 'agent-2', full_name: 'Agent Two', role: 'agent' }])
      .mockResolvedValueOnce([]) // UPDATE tickets assigned_to
      .mockResolvedValueOnce([]) // logEvent

    const result = await reassignCallbackTicketAction('t-1', 'agent-2')

    expect(result).toEqual({ data: true })
  })
})

describe('reviewSolutionAction', () => {
  it('rejects any role other than team_leader', async () => {
    mockRequireUser.mockResolvedValue(management)

    const result = await reviewSolutionAction('t-1', { action: 'approve' })

    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('requires edited_solution when action=edit', async () => {
    mockRequireUser.mockResolvedValue(teamLeader)

    const result = await reviewSolutionAction('t-1', { action: 'edit' })

    expect(result).toEqual({ error: 'edited_solution is required for action=edit' })
  })

  it('errors when no solution has been submitted yet', async () => {
    mockRequireUser.mockResolvedValue(teamLeader)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', issue_type: 'x', description: null, root_cause: null, rsrp: null, rsrq: null, sinr: null, regular_site: null, queue: 'ADVANCED' }])
      .mockResolvedValueOnce([]) // no pending ticket_solutions row

    const result = await reviewSolutionAction('t-1', { action: 'approve' })

    expect(result).toEqual({ error: 'No solution has been submitted for this ticket yet' })
  })

  it('errors when the solution was already reviewed', async () => {
    mockRequireUser.mockResolvedValue(teamLeader)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', issue_type: 'x', description: null, root_cause: null, rsrp: null, rsrq: null, sinr: null, regular_site: null, queue: 'ADVANCED' }])
      .mockResolvedValueOnce([{ id: 'sol-1', solution: 'fix', troubleshooting_performed: 'x', outcome: 'resolved', review_status: 'approved', escalation_id: null }])

    const result = await reviewSolutionAction('t-1', { action: 'approve' })

    expect(result).toEqual({ error: 'This solution was already approved' })
  })

  it('reject: does NOT insert into ai_knowledge (only approve/edit feed the knowledge base)', async () => {
    mockRequireUser.mockResolvedValue(teamLeader)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', issue_type: 'x', description: null, root_cause: null, rsrp: null, rsrq: null, sinr: null, regular_site: null, queue: 'ADVANCED' }])
      .mockResolvedValueOnce([{ id: 'sol-1', solution: 'fix', troubleshooting_performed: 'x', outcome: 'resolved', review_status: 'pending', escalation_id: null }])
      .mockResolvedValueOnce([]) // UPDATE ticket_solutions rejected
      .mockResolvedValueOnce([]) // logEvent review

    const result = await reviewSolutionAction('t-1', { action: 'reject', note: 'not it' })

    expect(result).toEqual({ data: true })
    expect(mockSql).toHaveBeenCalledTimes(4) // no ai_knowledge INSERT
  })

  it('approve: inserts into ai_knowledge using the original solution', async () => {
    mockRequireUser.mockResolvedValue(teamLeader)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', issue_type: 'x', description: null, root_cause: null, rsrp: null, rsrq: null, sinr: null, regular_site: null, queue: 'ADVANCED' }])
      .mockResolvedValueOnce([{ id: 'sol-1', solution: 'fix', troubleshooting_performed: 'x', outcome: 'resolved', review_status: 'pending', escalation_id: null }])
      .mockResolvedValueOnce([]) // UPDATE ticket_solutions approved
      .mockResolvedValueOnce([]) // INSERT ai_knowledge
      .mockResolvedValueOnce([]) // logEvent

    const result = await reviewSolutionAction('t-1', { action: 'approve' })

    expect(result).toEqual({ data: true })
    expect(mockSql).toHaveBeenCalledTimes(5)
  })

  it('edit: uses edited_solution (not the original) for both the update and ai_knowledge', async () => {
    mockRequireUser.mockResolvedValue(teamLeader)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', issue_type: 'x', description: null, root_cause: null, rsrp: null, rsrq: null, sinr: null, regular_site: null, queue: 'ADVANCED' }])
      .mockResolvedValueOnce([{ id: 'sol-1', solution: 'original', troubleshooting_performed: 'x', outcome: 'resolved', review_status: 'pending', escalation_id: null }])
      .mockResolvedValueOnce([]) // UPDATE ticket_solutions edited
      .mockResolvedValueOnce([]) // INSERT ai_knowledge
      .mockResolvedValueOnce([]) // logEvent

    await reviewSolutionAction('t-1', { action: 'edit', edited_solution: 'better fix' })

    const updateArgs = mockSql.mock.calls[2]
    expect(updateArgs).toContain('better fix')
    expect(updateArgs).not.toContain('original')
  })
})

describe('closeTicketAction', () => {
  it('requires the ticket to be resolved before closing', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'in_progress', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await closeTicketAction('t-1', null)

    expect(result).toEqual({ error: 'Ticket must be resolved before it can be closed' })
  })

  it('forbids closing a ticket you neither created nor are assigned to', async () => {
    mockRequireUser.mockResolvedValue(otherAgent)
    mockSql.mockResolvedValueOnce([{ id: 't-1', status: 'resolved', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])

    const result = await closeTicketAction('t-1', null)

    expect(result).toEqual({ error: 'This ticket is not yours' })
  })

  it('closes a resolved ticket and defaults the note when none is supplied', async () => {
    mockRequireUser.mockResolvedValue(agent)
    mockSql
      .mockResolvedValueOnce([{ id: 't-1', status: 'resolved', created_by: 'agent-1', assigned_to: null, escalation_destination: null }])
      .mockResolvedValueOnce([]) // UPDATE tickets closed
      .mockResolvedValueOnce([]) // logEvent closed

    const result = await closeTicketAction('t-1', null)

    expect(result).toEqual({ data: true })
    const logArgs = mockSql.mock.calls[2]
    expect(logArgs).toContain('Customer updated and ticket closed')
  })
})
