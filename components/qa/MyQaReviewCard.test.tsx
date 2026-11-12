import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyQaReviewCard from './MyQaReviewCard'
import { normalizeReview } from '@/lib/qa/reviewPageData'

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/qa/actions', () => ({ submitAgentFeedbackAction: jest.fn() }))
import { submitAgentFeedbackAction } from '@/app/(app)/qa/actions'

const baseRow = {
  id: 'r1', reviewer_id: 'rv1', reviewer_full_name: 'Rita', department: 'Social', legs: 'both', interaction_date: '2030-01-01',
  final_score: 90, rating_label: 'Good', critical_fail: false, agent_feedback: null,
  outcome: { result: 'Pass', headline: 'Scored 90%, at or above the 75% pass mark.', reasons: [] },
  rootCauses: [], legacyRootCause: null,
}
const review = baseRow as never

async function openEditor() {
  render(<MyQaReviewCard review={review} />)
  await userEvent.click(screen.getByRole('button', { name: /add feedback/i }))
}

describe('MyQaReviewCard errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('puts a failed feedback save under the feedback box with a red outline', async () => {
    ;(submitAgentFeedbackAction as jest.Mock).mockResolvedValue({ error: 'Could not save feedback.' })
    await openEditor()
    await userEvent.type(document.getElementById('qa-feedback-r1') as HTMLElement, 'Thanks')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    const msg = await screen.findByText('Could not save feedback.')
    expect(msg).toHaveAttribute('id', 'qa-feedback-r1-error')
    const box = document.getElementById('qa-feedback-r1') as HTMLElement
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box.className).toContain('border-red-500')
  })

  it('clears the error when the feedback is edited or the editor is cancelled', async () => {
    ;(submitAgentFeedbackAction as jest.Mock).mockResolvedValue({ error: 'Could not save feedback.' })
    await openEditor()
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await screen.findByText('Could not save feedback.')
    await userEvent.type(document.getElementById('qa-feedback-r1') as HTMLElement, 'x')
    expect(screen.queryByText('Could not save feedback.')).not.toBeInTheDocument()
  })
})

describe('MyQaReviewCard result summary', () => {
  it("renders 85% from normalized '85.0'", () => {
    const normalized = normalizeReview({ ...baseRow, final_score: '85.0', rating_label: 'Excellent' })
    render(<MyQaReviewCard review={normalized as never} />)
    expect(screen.getByTestId('review-result')).toHaveTextContent('Pass · 85%')
    expect(screen.getByText('Excellent')).toBeInTheDocument()
  })

  it('shows a fail, why, and the root causes with notes', () => {
    render(<MyQaReviewCard review={{
      ...baseRow, final_score: 60, rating_label: 'Fail (Critical)', critical_fail: true,
      outcome: { result: 'Fail', headline: 'Failed on a critical item — score capped at 60%.', reasons: ['Critical item missed: Promises kept'] },
      rootCauses: [{ name: 'Communication', notes: 'Apologise first' }],
    } as never} />)
    expect(screen.getByTestId('review-result')).toHaveTextContent('Fail · 60%')
    expect(screen.getByText('Critical item missed: Promises kept')).toBeInTheDocument()
    expect(screen.getByTestId('root-causes')).toHaveTextContent('Communication — Apologise first')
  })

  it('falls back to the legacy root cause and links to the review', () => {
    render(<MyQaReviewCard review={{ ...baseRow, legacyRootCause: 'Knowledge Gap' } as never} />)
    expect(screen.getByTestId('root-causes')).toHaveTextContent('Knowledge Gap')
    expect(screen.getByRole('link', { name: 'View review' })).toHaveAttribute('href', '/qa-reviews/r1')
  })

  it('shows Department · Legs', () => {
    render(<MyQaReviewCard review={{ ...baseRow, department: 'T2', legs: 'call' } as never} />)
    expect(screen.getByText('T2 Support · Call')).toBeInTheDocument()
  })
})
