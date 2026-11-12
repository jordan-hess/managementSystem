import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeamRequestsBody from './TeamRequestsBody'

jest.mock('animejs', () => ({ animate: jest.fn((_el: unknown, opts: { onComplete?: () => void }) => opts?.onComplete?.()) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/roster/actions', () => ({ reviewRequestAction: jest.fn() }))
import { reviewRequestAction } from '@/app/(app)/roster/actions'

const request = {
  id: 'r1', type: 'leave', status: 'pending', team_id: null, created_at: '2030-01-01T10:00:00Z',
  profiles: { full_name: 'Pat Smith' }, teams: null, leave_requests: [{ leave_type: 'annual', dates: ['2030-01-02'] }], overtime_requests: [],
} as never

function setup() {
  render(<TeamRequestsBody requests={[request]} currentUserId="u1" onRefresh={jest.fn()} />)
}

describe('TeamRequestsBody errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows a red error under the rejection reason when confirming with it empty', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm reject/i }))
    const input = document.getElementById('team-requests-reject_reason-r1') as HTMLElement
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.className).toContain('border-red-500')
    expect(screen.getByText('A reason is required when rejecting.')).toHaveAttribute('id', 'team-requests-reject_reason-r1-error')
    expect(reviewRequestAction).not.toHaveBeenCalled()
  })

  it('clears the reason error as soon as the user types', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm reject/i }))
    await userEvent.type(document.getElementById('team-requests-reject_reason-r1') as HTMLElement, 'No cover')
    expect(screen.queryByText('A reason is required when rejecting.')).not.toBeInTheDocument()
  })

  it('shows a failed quick-approve in the top banner', async () => {
    ;(reviewRequestAction as jest.Mock).mockResolvedValue({ error: 'Could not approve request.' })
    setup()
    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not approve request.')
    expect(alert).not.toHaveAttribute('id')
  })
})
