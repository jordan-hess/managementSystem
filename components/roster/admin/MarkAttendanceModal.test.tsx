import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MarkAttendanceModal from './MarkAttendanceModal'

jest.mock('@/app/(app)/roster/actions', () => ({ markAttendanceAction: jest.fn(), assignShiftOverridesAction: jest.fn() }))
import { markAttendanceAction, assignShiftOverridesAction } from '@/app/(app)/roster/actions'

const templates = [{ id: 's1', name: 'Day', start_time: '08:00:00', end_time: '17:00:00', work_days: [1] }] as never

function setup() {
  render(<MarkAttendanceModal open onClose={jest.fn()} onSuccess={jest.fn()} profileId="p1" profileName="Pat" date="2030-01-07" existing={null} currentOverride={null} shiftTemplates={templates} currentUserId="u1" />)
}
const save = () => screen.getByRole('button', { name: /save attendance/i })

describe('MarkAttendanceModal errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows a failed attendance save in the top banner', async () => {
    ;(markAttendanceAction as jest.Mock).mockResolvedValue({ error: 'Could not save attendance.' })
    setup()
    await userEvent.click(save())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not save attendance.')
    expect(alert).not.toHaveAttribute('id')
  })

  it('shows a failed shift change in the banner and clears it on the next attempt', async () => {
    ;(markAttendanceAction as jest.Mock).mockResolvedValue({})
    ;(assignShiftOverridesAction as jest.Mock).mockResolvedValueOnce({ error: 'Could not change shift.' }).mockResolvedValueOnce({})
    setup()
    await userEvent.click(screen.getByRole('button', { name: /08:00 – 17:00/ }))
    await userEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change shift.')
    await userEvent.click(save())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
