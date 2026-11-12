import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EscalationManager from './EscalationManager'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/admin/escalations/actions', () => ({ createEscalationAction: jest.fn() }))
jest.mock('@/lib/customers/search', () => ({ searchCustomersAction: jest.fn().mockResolvedValue({ data: [] }) }))
import { createEscalationAction } from '@/app/(app)/admin/escalations/actions'

const agents = [{ id: 'a1', full_name: 'Ann', email: 'a@r.co' }]
const customers = [{ id: 'c1', name: 'Cat', phone: '082' }]
const categories = [{ id: 'k1', name: 'Billing', is_active: true }] as never
const el = (id: string) => document.getElementById(id) as HTMLElement
import { searchCustomersAction } from '@/lib/customers/search'

async function pickCustomerBySearch(user: ReturnType<typeof userEvent.setup>, searchInputId: string, name = 'Ann') {
  ;(searchCustomersAction as jest.Mock).mockResolvedValue({ data: [{ id: 'c1', name, phone: '0821234567', email: null }] })
  await user.type(document.getElementById(searchInputId) as HTMLElement, name)
  await user.click(await screen.findByRole('button', { name: new RegExp(name) }))
}

async function openModal() {
  render(<EscalationManager agents={agents} customers={customers} escalations={[]} categories={categories} />)
  await userEvent.click(screen.getByRole('button', { name: /send escalation/i }))
}
const submit = () => screen.getAllByRole('button', { name: /send escalation/i }).pop() as HTMLElement

describe('EscalationManager field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under every required input together', async () => {
    await openModal()
    await userEvent.click(submit())
    for (const [id, msg] of [
      ['escalation-agent', 'Please select an agent.'],
      ['escalation-customer', 'Please select a customer.'],
      ['escalation-query_description', 'Issue description is required.'],
      ['escalation-category', 'Please select a category.'],
    ]) {
      expect(el(id)).toHaveAttribute('aria-invalid', 'true')
      expect(el(id).className).toContain('border-red-500')
      expect(screen.getByText(msg)).toBeInTheDocument()
    }
    expect(createEscalationAction).not.toHaveBeenCalled()
  })

  it('clears only the edited field\'s error', async () => {
    await openModal()
    await userEvent.click(submit())
    await userEvent.selectOptions(el('escalation-agent'), 'a1')
    expect(screen.queryByText('Please select an agent.')).not.toBeInTheDocument()
    expect(screen.getByText('Please select a category.')).toBeInTheDocument()
  })

  it('shows a thrown server error in the top banner', async () => {
    ;(createEscalationAction as jest.Mock).mockRejectedValue(new Error('Could not send escalation.'))
    await openModal()
    await userEvent.selectOptions(el('escalation-agent'), 'a1')
    await pickCustomerBySearch(userEvent.setup(), 'escalation-customer', 'Cat')
    await userEvent.type(el('escalation-query_description'), 'Broken')
    await userEvent.selectOptions(el('escalation-category'), 'k1')
    await userEvent.click(submit())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not send escalation.')
    expect(alert).not.toHaveAttribute('id')
  })
})
