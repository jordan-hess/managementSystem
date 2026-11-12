import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
jest.mock('@/app/(app)/demoRoleActions', () => ({ setDemoRole: jest.fn() }))

import RoleSwitcher from './RoleSwitcher'
import { setDemoRole } from '@/app/(app)/demoRoleActions'
import { DEMO_ROLES } from '@/lib/auth/demoRoles'

const mockSetDemoRole = setDemoRole as jest.Mock

beforeEach(() => {
  push.mockReset()
  refresh.mockReset()
  mockSetDemoRole.mockReset()
})

describe('RoleSwitcher', () => {
  it('opens automatically and lists every role when none is picked', () => {
    render(<RoleSwitcher currentRole={null} />)
    expect(screen.getByText('Choose a role')).toBeInTheDocument()
    for (const { label } of DEMO_ROLES) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('stays closed once a role is picked, and reopens from the sidebar button', async () => {
    render(<RoleSwitcher currentRole="agent" />)
    expect(screen.queryByText('Choose a role')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Switch role'))
    expect(screen.getByText('Choose a role')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Agent/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('sets the role and sends the user to /home; closes once the new role renders', async () => {
    mockSetDemoRole.mockResolvedValue({})
    const { rerender } = render(<RoleSwitcher currentRole={null} />)

    await userEvent.click(screen.getByRole('button', { name: /^QA Analyst/ }))

    expect(mockSetDemoRole).toHaveBeenCalledWith('qa_analyst')
    await waitFor(() => expect(push).toHaveBeenCalledWith('/home'))
    expect(refresh).toHaveBeenCalled()

    // router.refresh() re-renders the layout with the cookie's role.
    rerender(<RoleSwitcher currentRole="qa_analyst" />)
    expect(screen.queryByText('Choose a role')).not.toBeInTheDocument()
  })

  it('cannot be dismissed until a role is picked', () => {
    render(<RoleSwitcher currentRole={null} />)
    expect(screen.queryByTitle('Close')).not.toBeInTheDocument()
  })

  it('can be dismissed when switching from an existing role', async () => {
    render(<RoleSwitcher currentRole="agent" />)
    await userEvent.click(screen.getByLabelText('Switch role'))
    await userEvent.click(screen.getByTitle('Close'))
    expect(screen.queryByText('Choose a role')).not.toBeInTheDocument()
  })

  it('shows the error and stays open when the action fails', async () => {
    mockSetDemoRole.mockResolvedValue({ error: 'Role switching is disabled.' })
    render(<RoleSwitcher currentRole={null} />)

    await userEvent.click(screen.getByRole('button', { name: /^Admin/ }))

    expect(await screen.findByText('Role switching is disabled.')).toBeInTheDocument()
    expect(screen.getByText('Choose a role')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('warns when the active role has no seeded profile', async () => {
    render(<RoleSwitcher currentRole="hod" missingProfile />)
    await userEvent.click(screen.getByLabelText('Switch role'))
    expect(screen.getByText(/demo-role-profiles\.sql/)).toBeInTheDocument()
  })
})
