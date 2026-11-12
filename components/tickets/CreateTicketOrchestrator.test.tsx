import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateTicketOrchestrator from './CreateTicketOrchestrator'

jest.mock('@/lib/customers/actions', () => ({ createCustomerAction: jest.fn() }))
jest.mock('@/lib/customers/search', () => ({ searchCustomersAction: jest.fn().mockResolvedValue({ data: [] }) }))
jest.mock('@/lib/activeAssistance/actions', () => ({
  getActiveAssistanceAction: jest.fn().mockResolvedValue({ data: [] }),
  claimActiveAssistanceAction: jest.fn(),
}))
jest.mock('@/components/t2/CreateTicketModal', () => ({ __esModule: true, default: () => null }))
jest.mock('./BillingTicketModal', () => ({ __esModule: true, default: () => null }))
jest.mock('./SupportTicketModal', () => ({ __esModule: true, default: () => null, CHANNEL_CONFIG: {} }))
jest.mock('@/lib/queues/constants', () => ({ SOCIAL_QUEUES: [] }))

import { createCustomerAction } from '@/lib/customers/actions'

function setup() {
  render(<CreateTicketOrchestrator onClose={jest.fn()} customers={[]} agentCandidates={[]} userId="u" canAssign={false} onSaved={jest.fn()} />)
}
async function openNewCustomer() {
  await userEvent.click(screen.getByRole('button', { name: /\+ new customer/i }))
}
const el = (id: string) => document.getElementById(id) as HTMLElement

describe('CreateTicketOrchestrator new-customer field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('has no "pick from the full list" text (customers are found by search only)', () => {
    setup()
    expect(screen.queryByText(/pick from the full list/i)).not.toBeInTheDocument()
  })

  it('shows a red message under every empty new-customer input at once', async () => {
    setup()
    await openNewCustomer()
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    for (const [id, msg] of [
      ['orchestrator-new_name', 'Full name is required.'],
      ['orchestrator-new_phone', 'Phone number is required.'],
      ['orchestrator-new_email', 'Email is required.'],
    ]) {
      expect(el(id)).toHaveAttribute('aria-invalid', 'true')
      expect(el(id).className).toContain('border-red-500')
      expect(screen.getByText(msg)).toBeInTheDocument()
    }
    expect(createCustomerAction).not.toHaveBeenCalled()
  })

  it('clears only the edited input\'s error', async () => {
    setup()
    await openNewCustomer()
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await userEvent.type(el('orchestrator-new_name'), 'Ann')
    expect(screen.queryByText('Full name is required.')).not.toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
  })

  it('puts a server duplicate-email error under the email input', async () => {
    ;(createCustomerAction as jest.Mock).mockResolvedValue({ error: 'A customer with this email already exists', field: 'email' })
    setup()
    await openNewCustomer()
    await userEvent.type(el('orchestrator-new_name'), 'Ann')
    await userEvent.type(el('orchestrator-new_phone'), '0821234567')
    await userEvent.type(el('orchestrator-new_email'), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(el('orchestrator-new_email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/already exists/)).toHaveAttribute('id', 'orchestrator-new_email-error')
  })

  it('shows a server error with no field in the banner', async () => {
    ;(createCustomerAction as jest.Mock).mockResolvedValue({ error: 'Could not create customer.' })
    setup()
    await openNewCustomer()
    await userEvent.type(el('orchestrator-new_name'), 'Ann')
    await userEvent.type(el('orchestrator-new_phone'), '0821234567')
    await userEvent.type(el('orchestrator-new_email'), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Could not create customer.')
    expect(alert).not.toHaveAttribute('id')
  })
})
