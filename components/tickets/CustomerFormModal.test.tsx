import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerFormModal from './CustomerFormModal'

jest.mock('@/app/(app)/customers/actions', () => ({ createCustomer: jest.fn(), updateCustomer: jest.fn() }))
import { createCustomer, updateCustomer } from '@/app/(app)/customers/actions'

const el = (id: string) => document.getElementById(id) as HTMLElement
const setup = (editing: never | null = null) =>
  render(<CustomerFormModal open onClose={jest.fn()} editing={editing} onSaved={jest.fn()} />)
const submit = () => screen.getByRole('button', { name: /add customer|save changes/i })

describe('CustomerFormModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under name, phone and email on an empty submit', async () => {
    setup()
    await userEvent.click(submit())
    for (const [id, msg] of [
      ['customer-name', 'Name is required.'],
      ['customer-phone', 'Phone number is required.'],
      ['customer-email', 'Email is required.'],
    ]) {
      expect(el(id)).toHaveAttribute('aria-invalid', 'true')
      expect(el(id).className).toContain('border-red-500')
      expect(screen.getByText(msg)).toBeInTheDocument()
    }
    expect(createCustomer).not.toHaveBeenCalled()
  })

  it('rejects a malformed email under the email input', async () => {
    setup()
    await userEvent.type(el('customer-name'), 'Ann')
    await userEvent.type(el('customer-phone'), '0821234567')
    await userEvent.type(el('customer-email'), 'not-an-email')
    await userEvent.click(submit())
    expect(screen.getByText('Enter a valid email address.')).toHaveAttribute('id', 'customer-email-error')
  })

  it('clears only the edited field\'s error', async () => {
    setup()
    await userEvent.click(submit())
    await userEvent.type(el('customer-name'), 'Ann')
    expect(screen.queryByText('Name is required.')).not.toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
  })

  it('puts a server duplicate-email error under the email input', async () => {
    ;(createCustomer as jest.Mock).mockResolvedValue({ error: 'A customer with this email already exists', field: 'email' })
    setup()
    await userEvent.type(el('customer-name'), 'Ann')
    await userEvent.type(el('customer-phone'), '0821234567')
    await userEvent.type(el('customer-email'), 'a@b.co')
    await userEvent.click(submit())
    expect(await screen.findByText(/already exists/)).toHaveAttribute('id', 'customer-email-error')
    expect(el('customer-email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('puts a server phone-format error under the phone input when editing', async () => {
    ;(updateCustomer as jest.Mock).mockResolvedValue({ error: 'Phone number must contain numbers only', field: 'phone' })
    setup({ id: 'c1', name: 'Ann', phone: '+27 82', email: 'a@b.co', account_number: null, notes: null } as never)
    await userEvent.click(submit())
    expect(await screen.findByText(/numbers only/)).toHaveAttribute('id', 'customer-phone-error')
  })

  it('shows a server error with no field in the banner', async () => {
    ;(createCustomer as jest.Mock).mockResolvedValue({ error: 'Failed to create customer.' })
    setup()
    await userEvent.type(el('customer-name'), 'Ann')
    await userEvent.type(el('customer-phone'), '0821234567')
    await userEvent.type(el('customer-email'), 'a@b.co')
    await userEvent.click(submit())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Failed to create customer.')
    expect(alert).not.toHaveAttribute('id')
  })
})
