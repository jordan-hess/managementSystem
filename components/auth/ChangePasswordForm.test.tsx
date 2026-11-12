import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangePasswordForm from './ChangePasswordForm'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const el = (id: string) => document.getElementById(id) as HTMLElement
const submit = () => screen.getByRole('button', { name: /set new password/i })
const fetchMock = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = fetchMock as never
})

describe('ChangePasswordForm field errors', () => {
  it('shows a red error under the new password when it is too short', async () => {
    render(<ChangePasswordForm />)
    await userEvent.type(el('change-pw-new'), 'short')
    await userEvent.type(el('change-pw-confirm'), 'short')
    await userEvent.click(submit())
    expect(el('change-pw-new')).toHaveAttribute('aria-invalid', 'true')
    expect(el('change-pw-new').className).toContain('border-red-500')
    expect(screen.getByText('Password must be at least 8 characters.')).toHaveAttribute('id', 'change-pw-new-error')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a mismatch error under the confirm input, not the new password', async () => {
    render(<ChangePasswordForm />)
    await userEvent.type(el('change-pw-new'), 'longenough1')
    await userEvent.type(el('change-pw-confirm'), 'different1')
    await userEvent.click(submit())
    expect(screen.getByText('Passwords do not match.')).toHaveAttribute('id', 'change-pw-confirm-error')
    expect(el('change-pw-new')).not.toHaveAttribute('aria-invalid')
  })

  it('reports both problems at once and clears each as it is edited', async () => {
    render(<ChangePasswordForm />)
    await userEvent.type(el('change-pw-new'), 'short')
    await userEvent.type(el('change-pw-confirm'), 'other')
    await userEvent.click(submit())
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    await userEvent.type(el('change-pw-confirm'), 'x')
    expect(screen.queryByText('Passwords do not match.')).not.toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
  })

  it('shows a server error in the top banner', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Password too common.' }) })
    render(<ChangePasswordForm />)
    await userEvent.type(el('change-pw-new'), 'longenough1')
    await userEvent.type(el('change-pw-confirm'), 'longenough1')
    await userEvent.click(submit())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Password too common.')
    expect(alert).not.toHaveAttribute('id')
  })
})
