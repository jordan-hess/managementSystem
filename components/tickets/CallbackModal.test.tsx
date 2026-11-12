import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CallbackModal from './CallbackModal'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/support-tickets/actions', () => ({ createCallback: jest.fn(), updateCallback: jest.fn() }))
jest.mock('@/lib/customers/search', () => ({ searchCustomersAction: jest.fn().mockResolvedValue({ data: [] }) }))
jest.mock('@/lib/activeAssistance/actions', () => ({
  getActiveAssistanceAction: jest.fn().mockResolvedValue({ data: [] }),
  claimActiveAssistanceAction: jest.fn(),
}))

import { createCallback } from '@/app/(app)/support-tickets/actions'

const customers = [{ id: 'c1', name: 'Ann', phone: '0821234567' }]
const agents = [{ id: 'a1', full_name: 'Agent One' }]
const el = (id: string) => document.getElementById(id) as HTMLElement
import { searchCustomersAction } from '@/lib/customers/search'
import { getActiveAssistanceAction } from '@/lib/activeAssistance/actions'
import { updateCallback } from '@/app/(app)/support-tickets/actions'

async function pickCustomerBySearch(user: ReturnType<typeof userEvent.setup>, searchInputId: string, name = 'Ann') {
  ;(searchCustomersAction as jest.Mock).mockResolvedValue({ data: [{ id: 'c1', name, phone: '0821234567', email: null }] })
  await user.type(document.getElementById(searchInputId) as HTMLElement, name)
  await user.click(await screen.findByRole('button', { name: new RegExp(name) }))
}
const submit = () => screen.getByRole('button', { name: /^schedule$/i })

function setup(props = {}) {
  render(<CallbackModal open onClose={jest.fn()} customers={customers} userId="u1" isAdmin agents={agents} queueOptions={['whatsapp']} onSaved={jest.fn()} {...props} />)
}

describe('CallbackModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under every required input together on an empty submit', async () => {
    setup()
    await userEvent.click(submit())
    for (const [id, msg] of [
      ['callback-customer', 'Please select a customer.'],
      ['callback-queue', 'Please select a queue/channel.'],
      ['callback-scheduled_at', 'Scheduled date and time is required.'],
      ['callback-query_description', 'Query description is required.'],
    ]) {
      expect(el(id)).toHaveAttribute('aria-invalid', 'true')
      expect(el(id).className).toContain('border-red-500')
      expect(screen.getByText(msg)).toBeInTheDocument()
    }
    expect(createCallback).not.toHaveBeenCalled()
  })

  it('does not require an agent — admins can leave it on Myself', async () => {
    setup()
    await userEvent.click(submit())
    expect(el('callback-agent')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Please select a customer.')).toBeInTheDocument()
  })

  it('shows a server error in the top banner', async () => {
    ;(createCallback as jest.Mock).mockResolvedValue({ error: 'Could not schedule callback.' })
    setup({ isAdmin: false })
    await pickCustomerBySearch(userEvent.setup(), 'callback-customer')
    await userEvent.selectOptions(el('callback-queue'), 'whatsapp')
    await userEvent.type(el('callback-scheduled_at'), '2030-01-01T10:00')
    await userEvent.type(el('callback-query_description'), 'Call me')
    await userEvent.click(submit())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not schedule callback.')
    expect(alert).not.toHaveAttribute('id')
  })
})

const radio = (name: string) => screen.getByRole('radio', { name })
const fillCommon = async () => {
  await userEvent.selectOptions(el('callback-queue'), 'whatsapp')
  await userEvent.type(el('callback-scheduled_at'), '2030-01-01T10:00')
  await userEvent.type(el('callback-query_description'), 'Call me')
}

describe('CallbackModal modes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('opens on "Existing customer" with the search bar and no contact fields', () => {
    setup({ isAdmin: false })
    expect(radio('Existing customer')).toBeChecked()
    expect(radio('Callback details only')).not.toBeChecked()
    expect(el('callback-customer')).toBeInTheDocument()
    expect(el('callback-contact_phone')).toBeNull()
  })

  it('"Callback details only" shows name, number and email and a note that nothing is saved to the customer database', async () => {
    setup({ isAdmin: false })
    await userEvent.click(radio('Callback details only'))
    expect(el('callback-customer')).toBeNull()
    for (const id of ['callback-contact_name', 'callback-contact_phone', 'callback-contact_email']) expect(el(id)).toBeInTheDocument()
    expect(screen.getByText(/not added to the customer database/i)).toBeInTheDocument()
  })

  it('requires a number or an email in details mode, and does not ask for a customer', async () => {
    setup({ isAdmin: false })
    await userEvent.click(radio('Callback details only'))
    await userEvent.type(el('callback-contact_name'), 'Ann')
    await userEvent.click(submit())
    expect(screen.getByText('Enter a contact number or an email address.')).toBeInTheDocument()
    expect(screen.queryByText('Please select a customer.')).not.toBeInTheDocument()
    expect(createCallback).not.toHaveBeenCalled()
  })

  it('rejects a bad email and a short number', async () => {
    setup({ isAdmin: false })
    await userEvent.click(radio('Callback details only'))
    await userEvent.type(el('callback-contact_email'), 'nope')
    await userEvent.type(el('callback-contact_phone'), '123')
    await userEvent.click(submit())
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Contact number must have at least 7 digits.')).toBeInTheDocument()
    expect(createCallback).not.toHaveBeenCalled()
  })

  it('schedules a manual callback with customer_id null and the contact details', async () => {
    ;(createCallback as jest.Mock).mockResolvedValue({ data: { id: 'cb-1' } })
    setup({ isAdmin: false })
    await userEvent.click(radio('Callback details only'))
    await userEvent.type(el('callback-contact_name'), ' Ann ')
    await userEvent.type(el('callback-contact_phone'), '082 123 4567')
    await fillCommon()
    await userEvent.click(submit())
    expect(createCallback).toHaveBeenCalledTimes(1)
    const [payload, agentId] = (createCallback as jest.Mock).mock.calls[0]
    expect(payload.customer_id).toBeNull()
    expect(payload.contact).toEqual({ name: ' Ann ', email: '', phone: '082 123 4567' })
    expect(agentId).toBe('u1')
  })

  it('switching back to "Existing customer" clears the details and shows the search bar again', async () => {
    setup({ isAdmin: false })
    await userEvent.click(radio('Callback details only'))
    await userEvent.type(el('callback-contact_phone'), '0821234567')
    await userEvent.click(radio('Existing customer'))
    expect(el('callback-customer')).toBeInTheDocument()
    await userEvent.click(radio('Callback details only'))
    expect((el('callback-contact_phone') as HTMLInputElement).value).toBe('')
  })

  it('an existing-customer callback is sent exactly as before (customer_id, no contact)', async () => {
    ;(createCallback as jest.Mock).mockResolvedValue({ data: { id: 'cb-2' } })
    setup({ isAdmin: false })
    await pickCustomerBySearch(userEvent.setup(), 'callback-customer')
    await fillCommon()
    await userEvent.click(submit())
    const [payload] = (createCallback as jest.Mock).mock.calls[0]
    expect(payload.customer_id).toBe('c1')
    expect(payload.contact).toBeUndefined()
  })

  it('editing a manual callback keeps details mode, prefilled, with no mode toggle', () => {
    const editing = {
      id: 'cb-1', customer_id: null, agent_id: 'u1', created_by: 'u1', scheduled_at: '2030-01-01T10:00:00.000Z',
      query_description: 'Call me', possible_solution: null, status: 'pending', notes: null, completed_at: null,
      reminder_sent: false, queue: 'whatsapp', created_at: '', updated_at: '',
      contact_name: 'Ann', contact_email: 'ann@example.com', contact_phone: null,
    }
    setup({ isAdmin: false, editing })
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect((el('callback-contact_name') as HTMLInputElement).value).toBe('Ann')
    expect((el('callback-contact_email') as HTMLInputElement).value).toBe('ann@example.com')
    expect(el('callback-customer')).toBeNull()
  })

  it('editing a manual callback and saving calls updateCallback with customer_id null and the prefilled contact', async () => {
    ;(updateCallback as jest.Mock).mockResolvedValue({ data: { id: 'cb-1' } })
    const editing = {
      id: 'cb-1', customer_id: null, agent_id: 'u1', created_by: 'u1', scheduled_at: '2030-01-01T10:00:00.000Z',
      query_description: 'Call me', possible_solution: null, status: 'pending', notes: null, completed_at: null,
      reminder_sent: false, queue: 'whatsapp', created_at: '', updated_at: '',
      contact_name: 'Ann', contact_email: 'ann@example.com', contact_phone: null,
    }
    setup({ isAdmin: false, editing })
    await userEvent.click(screen.getByRole('button', { name: /save|update/i }))
    expect(updateCallback).toHaveBeenCalledTimes(1)
    const [id, payload] = (updateCallback as jest.Mock).mock.calls[0]
    expect(id).toBe('cb-1')
    expect(payload.customer_id).toBeNull()
    expect(payload.contact).toEqual({ name: 'Ann', email: 'ann@example.com', phone: '' })
    expect(createCallback).not.toHaveBeenCalled()
  })

  it('marks the Customer mode label as required', () => {
    setup({ isAdmin: false })
    expect(el('callback-mode-label')).toHaveTextContent('Customer *')
  })

  it('switching modes clears a selected customer', async () => {
    setup({ isAdmin: false })
    await pickCustomerBySearch(userEvent.setup(), 'callback-customer')
    expect(screen.getByText('Ann — 0821234567')).toBeInTheDocument()
    await userEvent.click(radio('Callback details only'))
    await userEvent.click(radio('Existing customer'))
    expect(screen.queryByText('Ann — 0821234567')).not.toBeInTheDocument()
    expect((el('callback-customer') as HTMLInputElement).value).toBe('')
  })

  it('switching modes clears field errors', async () => {
    setup({ isAdmin: false })
    await userEvent.click(radio('Callback details only'))
    await userEvent.click(submit())
    expect(screen.getByText('Enter a contact number or an email address.')).toBeInTheDocument()
    await userEvent.click(radio('Existing customer'))
    expect(screen.queryByText('Enter a contact number or an email address.')).not.toBeInTheDocument()
  })

  it('does not run the duplicate-assistance pre-check while typing contact details', async () => {
    setup({ isAdmin: false })
    await userEvent.click(radio('Callback details only'))
    ;(getActiveAssistanceAction as jest.Mock).mockClear()
    await userEvent.type(el('callback-contact_name'), 'Ann')
    await userEvent.type(el('callback-contact_phone'), '0821234567')
    expect(getActiveAssistanceAction).not.toHaveBeenCalled()
  })

  it('opened from a customer (initialCustomerId) it stays on that customer with no mode toggle', () => {
    setup({ isAdmin: false, initialCustomerId: 'c1' })
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})
