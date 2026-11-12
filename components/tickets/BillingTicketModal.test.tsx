import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BillingTicketModal from './BillingTicketModal'
import { BILLING_CHANNELS, BILLING_REASONS, BILLING_AMOUNT_REASONS } from '@/lib/billing/constants'

jest.mock('@/app/(app)/t2/actions', () => ({ createBillingTicketAction: jest.fn() }))
import { createBillingTicketAction } from '@/app/(app)/t2/actions'

const el = (id: string) => document.getElementById(id) as HTMLElement
const submit = () => screen.getByRole('button', { name: /create ticket/i })
const amountReason = BILLING_REASONS.find((r) => BILLING_AMOUNT_REASONS.includes(r))!

function setup() {
  render(<BillingTicketModal onClose={jest.fn()} customerId="c1" onSaved={jest.fn()} />)
}

describe('BillingTicketModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under channel and reason together on an empty submit', async () => {
    setup()
    await userEvent.click(submit())
    expect(el('billing-channel')).toHaveAttribute('aria-invalid', 'true')
    expect(el('billing-channel').className).toContain('border-red-500')
    expect(el('billing-reason')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Channel is required.')).toBeInTheDocument()
    expect(screen.getByText('Reason for follow-up is required.')).toBeInTheDocument()
    expect(createBillingTicketAction).not.toHaveBeenCalled()
  })

  it('clears the channel error when a channel is picked but keeps the reason error', async () => {
    setup()
    await userEvent.click(submit())
    await userEvent.selectOptions(el('billing-channel'), BILLING_CHANNELS[0])
    expect(screen.queryByText('Channel is required.')).not.toBeInTheDocument()
    expect(screen.getByText('Reason for follow-up is required.')).toBeInTheDocument()
  })

  it('requires the amount only for reasons that show it', async () => {
    setup()
    await userEvent.selectOptions(el('billing-channel'), BILLING_CHANNELS[0])
    await userEvent.selectOptions(el('billing-reason'), amountReason)
    await userEvent.click(submit())
    expect(el('billing-amount')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Amount is required for this reason.')).toBeInTheDocument()
    await userEvent.type(el('billing-amount'), '10')
    expect(screen.queryByText('Amount is required for this reason.')).not.toBeInTheDocument()
  })

  it('keeps the duplicate-ticket notice in the top banner', async () => {
    ;(createBillingTicketAction as jest.Mock).mockResolvedValue({ duplicates: [{}] })
    setup()
    await userEvent.selectOptions(el('billing-channel'), BILLING_CHANNELS[0])
    await userEvent.selectOptions(el('billing-reason'), BILLING_REASONS.find((r) => !BILLING_AMOUNT_REASONS.includes(r))!)
    await userEvent.click(submit())
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/active ticket already exists/i)
    expect(alert).not.toHaveAttribute('id')
  })
})
