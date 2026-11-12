import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateTicketModal from './CreateTicketModal'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))
jest.mock('@/app/(app)/t2/actions', () => ({ createTicketAction: jest.fn() }))
jest.mock('@/lib/customers/actions', () => ({ createCustomerAction: jest.fn() }))
jest.mock('@/lib/customers/search', () => ({ searchCustomersAction: jest.fn().mockResolvedValue({ data: [] }) }))
jest.mock('@/lib/activeAssistance/actions', () => ({
  getActiveAssistanceAction: jest.fn().mockResolvedValue({ data: [] }),
  claimActiveAssistanceAction: jest.fn(),
}))

import { createTicketAction } from '@/app/(app)/t2/actions'

const customer = { id: 'c1', name: 'Ann', phone: '0821234567' }

function setup(props: Partial<React.ComponentProps<typeof CreateTicketModal>> = {}) {
  return render(<CreateTicketModal onClose={jest.fn()} customers={[customer]} initialCustomer={customer} initialQueue="ADVANCED" {...props} />)
}

const submitBtn = () => screen.getByRole('button', { name: /create ticket/i })
const issueType = () => document.getElementById('create-ticket-issue_type') as HTMLElement

describe('CreateTicketModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('has no "pick from the full list" text (customers are found by search only)', () => {
    setup()
    expect(screen.queryByText(/pick from the full list/i)).not.toBeInTheDocument()
  })

  it('shows a red message and aria-invalid under the issue type when it is missing', async () => {
    setup()
    await userEvent.click(submitBtn())
    expect(issueType()).toHaveAttribute('aria-invalid', 'true')
    expect(issueType().className).toContain('border-red-500')
    expect(screen.getByText('Issue type is required.')).toBeInTheDocument()
    expect(createTicketAction).not.toHaveBeenCalled()
  })

  it('does not put the field error in the top banner', async () => {
    setup()
    await userEvent.click(submitBtn())
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveAttribute('id', 'create-ticket-issue_type-error')
  })

  it('clears only the edited field error (Review Focus 2)', async () => {
    setup({ initialCustomer: undefined })
    await userEvent.click(submitBtn())
    expect(screen.getByText('Please select a customer.')).toBeInTheDocument()
    await userEvent.selectOptions(issueType(), 'Slow speeds')
    expect(screen.queryByText('Issue type is required.')).not.toBeInTheDocument()
    expect(screen.getByText('Please select a customer.')).toBeInTheDocument()
  })

  it('clears stale errors when submitting again (Review Focus 3)', async () => {
    setup()
    await userEvent.click(submitBtn())
    await userEvent.selectOptions(issueType(), 'Slow speeds')
    ;(createTicketAction as jest.Mock).mockResolvedValue({ data: { id: 't1' } })
    await userEvent.click(submitBtn())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(createTicketAction).toHaveBeenCalledTimes(1)
  })

  it('drops the previous queue\'s field errors when the queue changes (Review Focus 5)', async () => {
    setup({ initialQueue: undefined })
    await userEvent.selectOptions(document.getElementById('create-ticket-queue') as HTMLElement, 'SIM SWAP')
    await userEvent.click(submitBtn())
    expect(screen.getByText('SIM type is required.')).toBeInTheDocument()
    await userEvent.selectOptions(document.getElementById('create-ticket-queue') as HTMLElement, 'ADVANCED')
    expect(screen.queryByText('SIM type is required.')).not.toBeInTheDocument()
  })

  it('shows the customer error even while the "+ New customer" form is open (standalone use)', async () => {
    setup({ initialCustomer: undefined, initialQueue: 'ADVANCED' })
    await userEvent.click(screen.getByRole('button', { name: /new customer/i }))
    await userEvent.click(submitBtn())
    expect(screen.getByText('Please select a customer.')).toBeInTheDocument()
  })

  it('shows a server error as a banner when it names no field', async () => {
    setup()
    await userEvent.selectOptions(issueType(), 'Slow speeds')
    ;(createTicketAction as jest.Mock).mockResolvedValue({ error: 'Could not create ticket.' })
    await userEvent.click(submitBtn())
    expect(screen.getByRole('alert')).toHaveTextContent('Could not create ticket.')
  })
})
