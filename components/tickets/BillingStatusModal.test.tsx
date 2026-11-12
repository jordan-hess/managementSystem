import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BillingStatusModal from './BillingStatusModal'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/t2/actions', () => ({ updateBillingTicketStatusAction: jest.fn() }))
import { updateBillingTicketStatusAction } from '@/app/(app)/t2/actions'

const ticket = (over = {}) => ({
  id: 't1', ticket_number: 'B-1', status: 'follow_up', channel: null, issue_type: null, amount: null,
  description: null, customer_name: null, customer_phone: null, events: [], ...over,
}) as never
const el = (id: string) => document.getElementById(id) as HTMLElement
const save = () => screen.getByRole('button', { name: /save status/i })

describe('BillingStatusModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows a red error under the escalation path when escalating without one', async () => {
    render(<BillingStatusModal open onClose={jest.fn()} ticket={ticket({ status: 'escalated' })} onSaved={jest.fn()} />)
    await userEvent.click(save())
    expect(el('billing-status-channel')).toHaveAttribute('aria-invalid', 'true')
    expect(el('billing-status-channel').className).toContain('border-red-500')
    expect(screen.getByText('Escalation path is required.')).toHaveAttribute('id', 'billing-status-channel-error')
    expect(updateBillingTicketStatusAction).not.toHaveBeenCalled()
  })

  it('clears the error once a path is picked', async () => {
    render(<BillingStatusModal open onClose={jest.fn()} ticket={ticket({ status: 'escalated' })} onSaved={jest.fn()} />)
    await userEvent.click(save())
    await userEvent.selectOptions(el('billing-status-channel'), 'Stitch')
    expect(screen.queryByText('Escalation path is required.')).not.toBeInTheDocument()
  })

  it('does not ask for a path for non-escalated statuses', async () => {
    ;(updateBillingTicketStatusAction as jest.Mock).mockResolvedValue({})
    render(<BillingStatusModal open onClose={jest.fn()} ticket={ticket()} onSaved={jest.fn()} />)
    await userEvent.click(save())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(updateBillingTicketStatusAction).toHaveBeenCalled()
  })

  it('shows a server error in the top banner', async () => {
    ;(updateBillingTicketStatusAction as jest.Mock).mockResolvedValue({ error: 'Could not update status.' })
    render(<BillingStatusModal open onClose={jest.fn()} ticket={ticket()} onSaved={jest.fn()} />)
    await userEvent.click(save())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not update status.')
    expect(alert).not.toHaveAttribute('id')
  })
})
