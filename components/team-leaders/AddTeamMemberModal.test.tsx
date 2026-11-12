import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddTeamMemberModal from './AddTeamMemberModal'

jest.mock('@/app/(app)/team-leaders/actions', () => ({ addPersonToTeam: jest.fn(), moveToLeaderSlot: jest.fn() }))

const el = (id: string) => document.getElementById(id) as HTMLElement
const create = () => screen.getByRole('button', { name: /create account/i })
const fetchMock = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = fetchMock as never
})

function setup() {
  render(<AddTeamMemberModal open onClose={jest.fn()} onSuccess={jest.fn()} />)
}
async function fillValid() {
  await userEvent.type(el('add-member-full_name'), 'Ann Agent')
  await userEvent.type(el('add-member-email'), 'ann@example.com')
}

describe('AddTeamMemberModal field errors', () => {
  it('shows red errors under name and email on an empty submit', async () => {
    setup()
    await userEvent.click(create())
    expect(el('add-member-full_name')).toHaveAttribute('aria-invalid', 'true')
    expect(el('add-member-full_name').className).toContain('border-red-500')
    expect(screen.getByText('Full name is required.')).toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed email under the email input', async () => {
    setup()
    await userEvent.type(el('add-member-full_name'), 'Ann')
    await userEvent.type(el('add-member-email'), 'nope')
    await userEvent.click(create())
    expect(screen.getByText('Enter a valid email address.')).toHaveAttribute('id', 'add-member-email-error')
  })

  it('clears only the edited field\'s error', async () => {
    setup()
    await userEvent.click(create())
    await userEvent.type(el('add-member-full_name'), 'Ann')
    expect(screen.queryByText('Full name is required.')).not.toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
  })

  it('puts a duplicate-email server error under the email input', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'A user with that email already exists.', field: 'email' }) })
    setup()
    await fillValid()
    await userEvent.click(create())
    expect(await screen.findByText('A user with that email already exists.')).toHaveAttribute('id', 'add-member-email-error')
    expect(el('add-member-email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a server error with no field in the top banner', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Server error.' }) })
    setup()
    await fillValid()
    await userEvent.click(create())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Server error.')
    expect(alert).not.toHaveAttribute('id')
  })
})
