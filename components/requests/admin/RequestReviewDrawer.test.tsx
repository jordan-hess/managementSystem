import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequestReviewDrawer from './RequestReviewDrawer'

jest.mock('animejs', () => ({ animate: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/roster/actions', () => ({ reviewRequestAction: jest.fn() }))
import { reviewRequestAction } from '@/app/(app)/roster/actions'

const request = {
  id: 'r1', type: 'leave', status: 'pending', created_at: '2030-01-01T10:00:00Z', admin_comment: null,
  profiles: { full_name: 'Pat Smith' }, teams: null, leave_requests: [{ leave_type: 'annual', dates: ['2030-01-02'], notes: null }], overtime_requests: [],
} as never
const el = () => document.getElementById('review-comment') as HTMLElement

function setup() {
  render(<RequestReviewDrawer request={request} open onClose={jest.fn()} onSuccess={jest.fn()} currentUserId="u1" />)
}

describe('RequestReviewDrawer errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it.each(['Reject', 'Changes'])('shows a red error under the comment when %s is clicked without one', async (label) => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: new RegExp(label, 'i') }))
    expect(el()).toHaveAttribute('aria-invalid', 'true')
    expect(el().className).toContain('border-red-500')
    expect(screen.getByText('A comment is required when rejecting or requesting changes.')).toHaveAttribute('id', 'review-comment-error')
    expect(reviewRequestAction).not.toHaveBeenCalled()
  })

  it('clears the comment error when the user types', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /reject/i }))
    await userEvent.type(el(), 'No cover')
    expect(screen.queryByText(/comment is required/i)).not.toBeInTheDocument()
  })

  it('does not require a comment to approve', async () => {
    ;(reviewRequestAction as jest.Mock).mockResolvedValue({})
    setup()
    await userEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(reviewRequestAction).toHaveBeenCalledWith('r1', 'approved', undefined)
  })

  it('shows a server error in the banner, not under the comment', async () => {
    ;(reviewRequestAction as jest.Mock).mockResolvedValue({ error: 'Could not review request.' })
    setup()
    await userEvent.click(screen.getByRole('button', { name: /approve/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not review request.')
    expect(alert).not.toHaveAttribute('id')
  })
})
