import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FollowupModal from './FollowupModal'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/support-tickets/actions', () => ({ createFollowupAction: jest.fn(), updateFollowupAction: jest.fn() }))
jest.mock('@/lib/customers/search', () => ({ searchCustomersAction: jest.fn().mockResolvedValue({ data: [] }) }))

import { createFollowupAction } from '@/app/(app)/support-tickets/actions'

const categories = [
  { id: 'k1', name: 'Cancellations', is_active: true },
  { id: 'k2', name: 'Other', is_active: true },
] as never
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
  render(<FollowupModal open onClose={jest.fn()} customers={customers} categories={categories} queueOptions={['whatsapp']} onSaved={jest.fn()} />)
}

describe('FollowupModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under customer, queue, description and category together on an empty submit', async () => {
    setup()
    await userEvent.click(submit())
    for (const [id, msg] of [
      ['followup-modal-customer', 'Please select a customer.'],
      ['followup-modal-queue', 'Please select a queue/channel.'],
      ['followup-modal-query_description', 'Query description is required.'],
      ['followup-modal-category', 'Please select a category.'],
    ]) {
      expect(el(id)).toHaveAttribute('aria-invalid', 'true')
      expect(el(id).className).toContain('border-red-500')
      expect(screen.getByText(msg)).toBeInTheDocument()
    }
    expect(createFollowupAction).not.toHaveBeenCalled()
  })

  it('clears only the edited field\'s error', async () => {
    setup()
    await userEvent.click(submit())
    await userEvent.selectOptions(el('followup-modal-queue'), 'whatsapp')
    expect(screen.queryByText('Please select a queue/channel.')).not.toBeInTheDocument()
    expect(screen.getByText('Please select a category.')).toBeInTheDocument()
  })

  it('requires a cancellation reason only for the Cancellations category', async () => {
    setup()
    await userEvent.selectOptions(el('followup-modal-category'), 'k2')
    await userEvent.click(submit())
    expect(screen.queryByText('Please provide a reason for cancellation.')).not.toBeInTheDocument()
    await userEvent.selectOptions(el('followup-modal-category'), 'k1')
    await userEvent.click(submit())
    expect(el('followup-modal-cancellation_reason')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a server error in the top banner', async () => {
    ;(createFollowupAction as jest.Mock).mockResolvedValue({ error: 'Could not save follow-up.' })
    setup()
    await pickCustomerBySearch(userEvent.setup(), 'followup-modal-customer')
    await userEvent.selectOptions(el('followup-modal-queue'), 'whatsapp')
    await userEvent.type(el('followup-modal-query_description'), 'Help')
    await userEvent.selectOptions(el('followup-modal-category'), 'k2')
    await userEvent.click(submit())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not save follow-up.')
    expect(alert).not.toHaveAttribute('id')
  })
})
