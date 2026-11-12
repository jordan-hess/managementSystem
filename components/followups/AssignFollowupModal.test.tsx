import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssignFollowupModal from './AssignFollowupModal'

jest.mock('@/app/(app)/support-tickets/actions', () => ({ assignFollowupAction: jest.fn(), reassignFollowupAction: jest.fn() }))
jest.mock('@/lib/customers/actions', () => ({ createCustomerAction: jest.fn() }))
jest.mock('@/lib/customers/search', () => ({ searchCustomersAction: jest.fn().mockResolvedValue({ data: [] }) }))
jest.mock('@/lib/activeAssistance/actions', () => ({
  getActiveAssistanceAction: jest.fn().mockResolvedValue({ data: [] }),
  claimActiveAssistanceAction: jest.fn(),
}))

import { assignFollowupAction } from '@/app/(app)/support-tickets/actions'
import { createCustomerAction } from '@/lib/customers/actions'

const categories = [
  { id: 'k1', name: 'Cancellations', is_active: true },
  { id: 'k2', name: 'Other', is_active: true },
] as never
const agents = [{ id: 'a1', full_name: 'Agent One' }] as never
const customers = [{ id: 'c1', name: 'Ann', phone: '0821234567' }]

const el = (id: string) => document.getElementById(id) as HTMLElement
import { searchCustomersAction } from '@/lib/customers/search'

async function pickCustomerBySearch(user: ReturnType<typeof userEvent.setup>, searchInputId: string, name = 'Ann') {
  ;(searchCustomersAction as jest.Mock).mockResolvedValue({ data: [{ id: 'c1', name, phone: '0821234567', email: null }] })
  await user.type(document.getElementById(searchInputId) as HTMLElement, name)
  await user.click(await screen.findByRole('button', { name: new RegExp(name) }))
}
const submit = () => screen.getByRole('button', { name: /add follow-up/i })

function setup() {
  render(
    <AssignFollowupModal open onClose={jest.fn()} editing={null} customers={customers} agentCandidates={agents}
      teamLeaderCandidates={[]} categories={categories} history={[]} userId="u1" onSaved={jest.fn()} />,
  )
}
async function pickNewCustomer() {
  await userEvent.click(screen.getByRole('button', { name: '+ New Customer' }))
}

describe('AssignFollowupModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under customer, description and category together on an empty submit', async () => {
    setup()
    await userEvent.click(submit())
    for (const [id, msg] of [
      ['followup-customer', 'Please select or create a customer.'],
      ['followup-query_description', 'Query description is required.'],
      ['followup-category', 'Please select a category.'],
    ]) {
      expect(el(id)).toHaveAttribute('aria-invalid', 'true')
      expect(el(id).className).toContain('border-red-500')
      expect(screen.getByText(msg)).toBeInTheDocument()
    }
    expect(assignFollowupAction).not.toHaveBeenCalled()
  })

  it('does not require an assignee — it can be left on Myself', async () => {
    setup()
    await userEvent.click(submit())
    expect(el('followup-agent')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Please select a category.')).toBeInTheDocument()
  })

  it('asks for each new-customer field and checks the email format', async () => {
    setup()
    await pickNewCustomer()
    await userEvent.click(submit())
    expect(screen.getByText('Full name is required.')).toHaveAttribute('id', 'followup-new_name-error')
    expect(screen.getByText('Phone number is required.')).toHaveAttribute('id', 'followup-new_phone-error')
    expect(screen.getByText('Email is required.')).toHaveAttribute('id', 'followup-new_email-error')
    await userEvent.type(el('followup-new_email'), 'nope')
    await userEvent.click(submit())
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
  })

  it('requires a cancellation reason only for the Cancellations category', async () => {
    setup()
    await userEvent.selectOptions(el('followup-category'), 'k2')
    await userEvent.click(submit())
    expect(screen.queryByText('Please provide a reason for cancellation.')).not.toBeInTheDocument()
    await userEvent.selectOptions(el('followup-category'), 'k1')
    await userEvent.click(submit())
    expect(el('followup-cancellation_reason')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Please provide a reason for cancellation.')).toBeInTheDocument()
  })

  it('puts a duplicate-email server error under the new customer email input', async () => {
    ;(createCustomerAction as jest.Mock).mockResolvedValue({ error: 'A customer with this email already exists', field: 'email' })
    setup()
    await pickNewCustomer()
    await userEvent.selectOptions(el('followup-agent'), 'a1')
    await userEvent.type(el('followup-new_name'), 'Ann')
    await userEvent.type(el('followup-new_phone'), '0821234567')
    await userEvent.type(el('followup-new_email'), 'a@b.co')
    await userEvent.type(el('followup-query_description'), 'Help')
    await userEvent.selectOptions(el('followup-category'), 'k2')
    await userEvent.click(submit())
    expect(await screen.findByText(/already exists/)).toHaveAttribute('id', 'followup-new_email-error')
    expect(el('followup-new_email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a server error with no field in the top banner', async () => {
    ;(assignFollowupAction as jest.Mock).mockResolvedValue({ error: 'Could not assign.' })
    setup()
    await userEvent.selectOptions(el('followup-agent'), 'a1')
    await userEvent.type(el('followup-query_description'), 'Help')
    await userEvent.selectOptions(el('followup-category'), 'k2')
    await pickCustomerBySearch(userEvent.setup(), 'followup-customer')
    await userEvent.click(submit())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not assign.')
    expect(alert).not.toHaveAttribute('id')
  })
})
