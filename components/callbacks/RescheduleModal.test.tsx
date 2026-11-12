import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RescheduleModal from './RescheduleModal'

jest.mock('@/app/(app)/support-tickets/actions', () => ({ rescheduleCallback: jest.fn(), sendCallbackToLateShift: jest.fn() }))
import { rescheduleCallback, sendCallbackToLateShift } from '@/app/(app)/support-tickets/actions'

const callback = { id: 'cb1', scheduled_at: '2030-01-01T10:00:00', customers: { name: 'Ann', phone: '082' } } as never
const el = (id: string) => document.getElementById(id) as HTMLElement

function setup() {
  render(<RescheduleModal open onClose={jest.fn()} onSuccess={jest.fn()} callback={callback} currentUserId="u1" />)
}

describe('RescheduleModal errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows a red error under the date/time input when it is cleared', async () => {
    setup()
    await userEvent.clear(el('reschedule-new_date_time'))
    await userEvent.click(screen.getByRole('button', { name: /^reschedule$/i }))
    expect(el('reschedule-new_date_time')).toHaveAttribute('aria-invalid', 'true')
    expect(el('reschedule-new_date_time').className).toContain('border-red-500')
    expect(screen.getByText('New date and time is required.')).toHaveAttribute('id', 'reschedule-new_date_time-error')
    expect(rescheduleCallback).not.toHaveBeenCalled()
  })

  it('shows a server error from rescheduling in the top banner', async () => {
    ;(rescheduleCallback as jest.Mock).mockResolvedValue({ error: 'Could not reschedule.' })
    setup()
    await userEvent.click(screen.getByRole('button', { name: /^reschedule$/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not reschedule.')
    expect(alert).not.toHaveAttribute('id')
  })

  it('shows a server error from the late-shift hand-off in the banner too', async () => {
    ;(sendCallbackToLateShift as jest.Mock).mockResolvedValue({ error: 'No late shift rostered.' })
    setup()
    await userEvent.click(screen.getByRole('button', { name: /send to late shift/i }))
    await userEvent.click(screen.getAllByRole('button', { name: /send to late shift/i }).pop() as HTMLElement)
    expect(await screen.findByRole('alert')).toHaveTextContent('No late shift rostered.')
  })
})
