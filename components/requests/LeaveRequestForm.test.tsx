import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeaveRequestForm from './LeaveRequestForm'

jest.mock('animejs', () => ({ animate: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/roster/actions', () => ({ submitLeaveRequest: jest.fn() }))
import { submitLeaveRequest } from '@/app/(app)/roster/actions'

const profile = { full_name: 'Pat Smith' } as never
const submit = () => screen.getByRole('button', { name: /submit leave request/i })
const calendar = () => document.getElementById('leave-dates') as HTMLElement
// "15" is always inside the displayed month's own days, never a leading/trailing overflow day.
const pickDay = async () => {
  const day = screen.getAllByRole('button', { name: '15' }).find(b => !(b as HTMLButtonElement).disabled) as HTMLElement
  await userEvent.click(day)
}

function setup() {
  render(<LeaveRequestForm profile={profile} userTeam={null} onSuccess={jest.fn()} />)
}

describe('LeaveRequestForm errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('outlines the calendar and shows the message when no date is selected', async () => {
    setup()
    await userEvent.click(submit())
    expect(calendar()).toHaveAttribute('aria-invalid', 'true')
    expect(calendar().className).toContain('border-red-500')
    expect(screen.getByText('Please select at least one date.')).toHaveAttribute('id', 'leave-dates-error')
    expect(submitLeaveRequest).not.toHaveBeenCalled()
  })

  it('clears the error once a date is picked', async () => {
    setup()
    await userEvent.click(submit())
    await pickDay()
    expect(screen.queryByText('Please select at least one date.')).not.toBeInTheDocument()
  })

  it('shows a server error in the top banner', async () => {
    ;(submitLeaveRequest as jest.Mock).mockResolvedValue({ error: 'Could not submit request.' })
    setup()
    await pickDay()
    await userEvent.click(submit())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not submit request.')
    expect(alert).not.toHaveAttribute('id')
  })
})
