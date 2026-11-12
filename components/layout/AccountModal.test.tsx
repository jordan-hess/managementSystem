import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountModal from './AccountModal'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/actions', () => ({ updateOwnProfile: jest.fn() }))
import { updateOwnProfile } from '@/app/(app)/actions'

const el = (id: string) => document.getElementById(id) as HTMLElement
const fetchMock = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = fetchMock as never
})

function setup() {
  render(<AccountModal open onClose={jest.fn()} userId="u1" fullName="Pat Smith" email="pat@example.com" />)
}
const saveProfile = () => screen.getByRole('button', { name: /save profile/i })
const updatePw = () => screen.getByRole('button', { name: /update password/i })

describe('AccountModal profile form', () => {
  it('shows required errors under the name and email when both are cleared', async () => {
    setup()
    await userEvent.clear(el('account-full_name'))
    await userEvent.clear(el('account-email'))
    await userEvent.click(saveProfile())
    expect(screen.getByText('Full name is required.')).toHaveAttribute('id', 'account-full_name-error')
    expect(screen.getByText('Email is required.')).toHaveAttribute('id', 'account-email-error')
    expect(el('account-email').className).toContain('border-red-500')
    expect(updateOwnProfile).not.toHaveBeenCalled()
  })

  it('rejects a malformed email under the email input', async () => {
    setup()
    await userEvent.clear(el('account-email'))
    await userEvent.type(el('account-email'), 'nope')
    await userEvent.click(saveProfile())
    expect(screen.getByText('Enter a valid email address.')).toHaveAttribute('id', 'account-email-error')
  })

  it('shows a server error in that form\'s banner only', async () => {
    ;(updateOwnProfile as jest.Mock).mockResolvedValue({ error: 'Could not update profile.' })
    setup()
    await userEvent.type(el('account-full_name'), 'x')
    await userEvent.click(saveProfile())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not update profile.')
    expect(alert).not.toHaveAttribute('id')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})

describe('AccountModal password form', () => {
  it('shows a red error under a too-short new password', async () => {
    setup()
    await userEvent.type(el('account-new_password'), 'short')
    await userEvent.type(el('account-confirm_password'), 'short')
    await userEvent.click(updatePw())
    expect(screen.getByText('Password must be at least 8 characters.')).toHaveAttribute('id', 'account-new_password-error')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a mismatch error under the confirm input and clears it on edit', async () => {
    setup()
    await userEvent.type(el('account-new_password'), 'longenough1')
    await userEvent.type(el('account-confirm_password'), 'different1')
    await userEvent.click(updatePw())
    expect(screen.getByText('Passwords do not match.')).toHaveAttribute('id', 'account-confirm_password-error')
    await userEvent.type(el('account-confirm_password'), 'x')
    expect(screen.queryByText('Passwords do not match.')).not.toBeInTheDocument()
  })

  it('shows a server error in the password form\'s banner', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Password too common.' }) })
    setup()
    await userEvent.type(el('account-new_password'), 'longenough1')
    await userEvent.type(el('account-confirm_password'), 'longenough1')
    await userEvent.click(updatePw())
    expect(await screen.findByRole('alert')).toHaveTextContent('Password too common.')
  })
})
