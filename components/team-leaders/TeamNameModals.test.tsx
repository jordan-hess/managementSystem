import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddTeamModal from './AddTeamModal'
import EditTeamNameModal from './EditTeamNameModal'
import AddToTeamModal from './AddToTeamModal'

jest.mock('@/app/(app)/team-leaders/actions', () => ({
  createTeam: jest.fn(), renameTeam: jest.fn(), addPersonToTeam: jest.fn(), moveToLeaderSlot: jest.fn(),
}))
import { createTeam, renameTeam, addPersonToTeam } from '@/app/(app)/team-leaders/actions'

const el = (id: string) => document.getElementById(id) as HTMLElement

beforeEach(() => jest.clearAllMocks())

describe('AddTeamModal', () => {
  it('puts a duplicate-name server error under the name input', async () => {
    ;(createTeam as jest.Mock).mockResolvedValue({ error: 'A team with that name already exists.', field: 'name' })
    render(<AddTeamModal open onClose={jest.fn()} onSuccess={jest.fn()} />)
    await userEvent.type(el('add-team-name'), 'Alpha')
    await userEvent.click(screen.getByRole('button', { name: /create team/i }))
    expect(await screen.findByText('A team with that name already exists.')).toHaveAttribute('id', 'add-team-name-error')
    expect(el('add-team-name')).toHaveAttribute('aria-invalid', 'true')
    expect(el('add-team-name').className).toContain('border-red-500')
  })

  it('clears the name error when the user edits the name', async () => {
    ;(createTeam as jest.Mock).mockResolvedValue({ error: 'A team with that name already exists.', field: 'name' })
    render(<AddTeamModal open onClose={jest.fn()} onSuccess={jest.fn()} />)
    await userEvent.type(el('add-team-name'), 'Alpha')
    await userEvent.click(screen.getByRole('button', { name: /create team/i }))
    await userEvent.type(el('add-team-name'), '2')
    expect(screen.queryByText('A team with that name already exists.')).not.toBeInTheDocument()
  })

  it('shows a server error with no field in the top banner', async () => {
    ;(createTeam as jest.Mock).mockResolvedValue({ error: 'You do not have permission to perform this action.' })
    render(<AddTeamModal open onClose={jest.fn()} onSuccess={jest.fn()} />)
    await userEvent.type(el('add-team-name'), 'Alpha')
    await userEvent.click(screen.getByRole('button', { name: /create team/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('You do not have permission')
    expect(alert).not.toHaveAttribute('id')
  })
})

describe('EditTeamNameModal', () => {
  const team = { id: 't1', name: 'Alpha', color: 'blue' } as never

  it('puts a duplicate-name server error under the name input', async () => {
    ;(renameTeam as jest.Mock).mockResolvedValue({ error: 'A team with that name already exists.', field: 'name' })
    render(<EditTeamNameModal team={team} onClose={jest.fn()} onSuccess={jest.fn()} />)
    await userEvent.type(el('edit-team-name'), '2')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText('A team with that name already exists.')).toHaveAttribute('id', 'edit-team-name-error')
    expect(el('edit-team-name')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('AddToTeamModal', () => {
  it('shows a server error in the top banner', async () => {
    ;(addPersonToTeam as jest.Mock).mockResolvedValue({ error: 'Profile not found.' })
    render(<AddToTeamModal teamId="t1" unassigned={[{ id: 'p1', full_name: 'Pat', email: 'p@r.co', role: 'agent' }] as never} onClose={jest.fn()} onSuccess={jest.fn()} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'p1')
    await userEvent.click(screen.getByRole('button', { name: /add to team/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Profile not found.')
    expect(alert).not.toHaveAttribute('id')
  })
})
