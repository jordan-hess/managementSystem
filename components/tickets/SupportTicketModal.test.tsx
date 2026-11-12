import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SupportTicketModal from './SupportTicketModal'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/support-tickets/actions', () => ({
  createSupportTicketAction: jest.fn(),
  updateSupportTicketAction: jest.fn(),
  getSupportTicketStatusHistoryAction: jest.fn().mockResolvedValue({ data: [] }),
}))
jest.mock('@/lib/activeAssistance/actions', () => ({
  getActiveAssistanceAction: jest.fn().mockResolvedValue({ data: [] }),
  claimActiveAssistanceAction: jest.fn(),
}))

jest.mock('@/lib/customers/search', () => ({ searchCustomersAction: jest.fn().mockResolvedValue({ data: [] }) }))

import { createSupportTicketAction, updateSupportTicketAction } from '@/app/(app)/support-tickets/actions'
import { searchCustomersAction } from '@/lib/customers/search'

async function pickCustomerBySearch(user: ReturnType<typeof userEvent.setup>, searchInputId: string, name = 'Ann') {
  ;(searchCustomersAction as jest.Mock).mockResolvedValue({ data: [{ id: 'c1', name, phone: '0821234567', email: null }] })
  await user.type(document.getElementById(searchInputId) as HTMLElement, name)
  await user.click(await screen.findByRole('button', { name: new RegExp(name) }))
}

const customers = [{ id: 'c1', name: 'Ann', phone: '0821234567', email: 'ann@example.com' }]
const agents = [{ id: 'a1', full_name: 'Agent One' }] as never
const el = (id: string) => document.getElementById(id) as HTMLElement
const submit = (label = /add ticket/i) => screen.getByRole('button', { name: label })

function setupNew(props = {}) {
  render(<SupportTicketModal open onClose={jest.fn()} editing={null} customers={customers} agentCandidates={agents} userId="u1" canAssign onSaved={jest.fn()} {...props} />)
}

const editingTicket = (over = {}) => ({
  id: 't1', customer_id: 'c1', agent_id: 'a1', channel: 'freescout', reference: null,
  query_description: 'Something', query_type: null, issue_type: null, root_cause: null, priority: 'normal',
  due_date: null, status: 'open', resolution_notes: null, escalation_destination: null, escalation_notes: null,
  followup_notes: null, followup_scheduled_at: null, callback_notes: null, callback_scheduled_at: null, ...over,
}) as never

describe('SupportTicketModal editing an existing ticket', () => {
  beforeEach(() => jest.clearAllMocks())

  const renderEdit = (customerList: { id: string; name: string; phone: string; email: string | null }[] = customers) =>
    render(<SupportTicketModal open onClose={jest.fn()} editing={editingTicket()} customers={customerList} agentCandidates={agents} userId="u1" canAssign onSaved={jest.fn()} />)

  it('shows the ticket\'s customer read-only: name, number and email, with no customer picker', () => {
    renderEdit()
    expect(document.getElementById('support-customer')).toBeNull()
    expect(screen.getByText('Ann')).toBeInTheDocument()
    expect(screen.getByText('0821234567')).toBeInTheDocument()
    expect(screen.getByText('ann@example.com')).toBeInTheDocument()
  })

  it('shows a dash when the customer has no email', () => {
    renderEdit([{ id: 'c1', name: 'Ann', phone: '0821234567', email: null }])
    expect(screen.getByTestId('ticket-customer-email')).toHaveTextContent('—')
  })

  it('has no Priority or Due Date fields', () => {
    renderEdit()
    expect(screen.queryByText('Priority')).not.toBeInTheDocument()
    expect(screen.queryByText('Due Date')).not.toBeInTheDocument()
  })

  it('still saves against the same customer', async () => {
    ;(updateSupportTicketAction as jest.Mock).mockResolvedValue({ data: {} })
    renderEdit()
    await userEvent.click(submit(/save changes/i))
    expect(updateSupportTicketAction).toHaveBeenCalledWith('t1', expect.objectContaining({ customer_id: 'c1' }))
  })
})

describe('SupportTicketModal creating a ticket', () => {
  it('still lets the agent pick the customer', () => {
    setupNew()
    expect(el('support-customer')).toBeInTheDocument()
  })

  it('has no customer dropdown, only the search field', () => {
    setupNew()
    expect(screen.queryByRole('option', { name: 'Select customer...' })).not.toBeInTheDocument()
    expect(el('support-customer').tagName).toBe('INPUT')
  })
})

describe('SupportTicketModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under customer and description together on an empty submit', async () => {
    setupNew()
    await userEvent.click(submit())
    for (const [id, msg] of [
      ['support-customer', 'Please select a customer.'],
      ['support-query_description', 'Query description is required.'],
    ]) {
      expect(el(id)).toHaveAttribute('aria-invalid', 'true')
      expect(el(id).className).toContain('border-red-500')
      expect(screen.getByText(msg)).toBeInTheDocument()
    }
    expect(createSupportTicketAction).not.toHaveBeenCalled()
  })

  it('does not require an agent — admins can leave it on Myself', async () => {
    setupNew()
    await userEvent.click(submit())
    expect(el('support-agent')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the escalation destination error on an escalated ticket', async () => {
    render(<SupportTicketModal open onClose={jest.fn()} editing={editingTicket({ status: 'escalated' })} customers={customers} agentCandidates={agents} userId="u1" canAssign onSaved={jest.fn()} />)
    await userEvent.click(submit(/save changes/i))
    expect(el('support-escalation')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Escalation destination is required.')).toBeInTheDocument()
    expect(updateSupportTicketAction).not.toHaveBeenCalled()
  })

  it('asks for the query type before the issue type when resolving', async () => {
    render(<SupportTicketModal open onClose={jest.fn()} editing={editingTicket({ status: 'resolved' })} customers={customers} agentCandidates={agents} userId="u1" canAssign onSaved={jest.fn()} />)
    await userEvent.click(submit(/save changes/i))
    expect(screen.getByText('A query type is required to resolve this ticket.')).toBeInTheDocument()
    expect(el('support-query_type')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Issue type is required to resolve this ticket.')).not.toBeInTheDocument()
  })

  it('shows a server error in the top banner', async () => {
    ;(createSupportTicketAction as jest.Mock).mockResolvedValue({ error: 'Could not save ticket.' })
    setupNew()
    await pickCustomerBySearch(userEvent.setup(), 'support-customer')
    await userEvent.selectOptions(el('support-agent'), 'a1')
    await userEvent.type(el('support-query_description'), 'Broken')
    await userEvent.click(submit())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not save ticket.')
    expect(alert).not.toHaveAttribute('id')
  })
})
