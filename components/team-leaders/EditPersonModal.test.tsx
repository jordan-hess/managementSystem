import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditPersonModal from './EditPersonModal'

jest.mock('@/app/(app)/team-leaders/actions', () => ({ updatePersonProfile: jest.fn() }))
import { updatePersonProfile } from '@/app/(app)/team-leaders/actions'

const person = { id: 'p1', full_name: 'Pat', email: 'pat@example.com', role: 'agent', department: null, is_active: true } as never
const el = (id: string) => document.getElementById(id) as HTMLElement
const save = () => screen.getByRole('button', { name: /save changes/i })

function setup(props: Partial<React.ComponentProps<typeof EditPersonModal>> = {}) {
  render(<EditPersonModal person={person} isCurrentlyLeading={false} canEditRoleAndDept onClose={jest.fn()} onSuccess={jest.fn()} {...props} />)
}

describe('EditPersonModal role select', () => {
  it('shows an HOD as HOD, not as the first option (Agent)', () => {
    setup({ person: { ...(person as object), role: 'hod' } as never })
    const select = el('edit-person-role') as HTMLSelectElement
    expect(select.value).toBe('hod')
    expect(select.selectedOptions[0]).toHaveTextContent('HOD')
  })
})

describe('EditPersonModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows required and format errors under the name and email inputs', async () => {
    setup()
    await userEvent.clear(el('edit-person-full_name'))
    await userEvent.clear(el('edit-person-email'))
    await userEvent.click(save())
    expect(screen.getByText('Full name is required.')).toHaveAttribute('id', 'edit-person-full_name-error')
    expect(screen.getByText('Email is required.')).toHaveAttribute('id', 'edit-person-email-error')
    await userEvent.type(el('edit-person-email'), 'nope')
    await userEvent.click(save())
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(updatePersonProfile).not.toHaveBeenCalled()
  })

  it('puts the team-leader role conflict under the role select', async () => {
    setup({ isCurrentlyLeading: true })
    await userEvent.click(save())
    expect(el('edit-person-role')).toHaveAttribute('aria-invalid', 'true')
    expect(el('edit-person-role').className).toContain('border-red-500')
    expect(screen.getByText(/currently leads a team — remove them as team leader/i)).toHaveAttribute('id', 'edit-person-role-error')
    expect(updatePersonProfile).not.toHaveBeenCalled()
  })

  it('puts a duplicate-email server error under the email input', async () => {
    ;(updatePersonProfile as jest.Mock).mockResolvedValue({ error: 'Another account already uses that email.', field: 'email' })
    setup()
    await userEvent.click(save())
    expect(await screen.findByText('Another account already uses that email.')).toHaveAttribute('id', 'edit-person-email-error')
  })

  it('shows a server error with no field in the top banner', async () => {
    ;(updatePersonProfile as jest.Mock).mockResolvedValue({ error: 'Profile not found.' })
    setup()
    await userEvent.click(save())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Profile not found.')
    expect(alert).not.toHaveAttribute('id')
  })
})
