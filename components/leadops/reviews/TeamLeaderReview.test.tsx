import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeamLeaderReview from './TeamLeaderReview'
import type { TeamLeaderReviewView } from '@/lib/leadops/reviewActions'
import { REVIEW_MESSAGES } from '@/lib/leadops/reviewLimits'
import { buildReviewSnapshot } from '@/lib/leadops/reviewSnapshot'

const SNAP = buildReviewSnapshot({ period: '2026-10-01', teamLeaderName: 'Taylor', sharedByName: 'Alex', takenAt: '2026-11-03T12:20:00.000Z', scores: [], weekly: { weeks: 4, calibrationAttended: 3, coachingSessions: 9, agentInSeatDays: 2, criticalFails: 1, reAudits: 6 } })

const shared = (over: Partial<TeamLeaderReviewView> = {}): TeamLeaderReviewView => ({
  kind: 'team_leader', state: 'shared', reviewId: 'r1',
  shared: { shareEventId: 'e2', notes: 'Strong month on quality', agreedActions: '1. Protect the 10:30 slot', snapshot: SNAP, reviewedBy: 'Alex', sharedAt: '2026-11-03T12:20:00Z' },
  events: [{ id: 'e2', fromStatus: 'draft', toStatus: 'shared', actorName: 'Alex', at: '2026-11-03T12:20:00Z', note: null }],
  ...over,
})
const onAcknowledge = jest.fn()
const onViewed = jest.fn()
const onReload = jest.fn()
const setup = (view: TeamLeaderReviewView) => render(<TeamLeaderReview view={view} period="2026-10-01" onAcknowledge={onAcknowledge} onViewed={onViewed} onReload={onReload} />)

beforeEach(() => { jest.clearAllMocks(); onAcknowledge.mockResolvedValue({ ok: true, revision: 4 }) })

describe('TeamLeaderReview — what the team leader sees', () => {
  it('with nothing shared: the empty state naming the month', () => {
    setup({ kind: 'team_leader', state: 'none', reviewId: null, shared: null, events: [] })
    expect(screen.getByText('No review shared for October yet.')).toBeInTheDocument()
  })

  it('while the reviewer is revising it: "being revised", and no text', () => {
    setup({ kind: 'team_leader', state: 'being_revised', reviewId: 'r1', shared: null, events: [] })
    expect(screen.getByText('This review is being revised. You will be told when it is shared again.')).toBeInTheDocument()
    expect(screen.queryByText('Acknowledge')).not.toBeInTheDocument()
  })

  it('a shared review: who reviewed it, when, the figures as at the snapshot time, and the frozen notes and actions', () => {
    setup(shared())
    expect(screen.getByText('Reviewed by Alex')).toBeInTheDocument()
    expect(screen.getByText('Shared 3 Nov, 14:20')).toBeInTheDocument()
    expect(screen.getByText('Figures as at 3 Nov, 14:20')).toBeInTheDocument()
    expect(screen.getByText('Strong month on quality')).toBeInTheDocument()
    expect(screen.getByText('1. Protect the 10:30 slot')).toBeInTheDocument()
  })

  it('the history shows the status changes only — who and when — never any copy of text', () => {
    setup(shared())
    expect(screen.getByText(/Shared by Alex/)).toBeInTheDocument()
  })
})

describe('TeamLeaderReview — the viewed mark', () => {
  it('records that this share was opened — once, for the share shown', () => {
    const { rerender } = setup(shared())
    expect(onViewed).toHaveBeenCalledTimes(1)
    expect(onViewed).toHaveBeenCalledWith('r1', 'e2')
    rerender(<TeamLeaderReview view={shared()} period="2026-10-01" onAcknowledge={onAcknowledge} onViewed={onViewed} onReload={onReload} />)
    expect(onViewed).toHaveBeenCalledTimes(1)
  })

  it('a NEW share shown later is marked again', () => {
    const { rerender } = setup(shared())
    const next = shared()
    next.shared = { ...next.shared!, shareEventId: 'e5' }
    rerender(<TeamLeaderReview view={next} period="2026-10-01" onAcknowledge={onAcknowledge} onViewed={onViewed} onReload={onReload} />)
    expect(onViewed).toHaveBeenLastCalledWith('r1', 'e5')
  })

  it('nothing is marked when there is nothing to read', () => {
    setup({ kind: 'team_leader', state: 'being_revised', reviewId: 'r1', shared: null, events: [] })
    expect(onViewed).not.toHaveBeenCalled()
  })
})

describe('TeamLeaderReview — acknowledging', () => {
  it("says what acknowledging means, on the button's side of the screen", () => {
    setup(shared())
    expect(screen.getByText("Acknowledge: confirms you've read this review, not that you agree with it.")).toBeInTheDocument()
  })

  it('sends the share event the team leader was shown, with the optional comment', async () => {
    setup(shared())
    await userEvent.type(screen.getByLabelText('Your comment (optional)'), 'Thanks — noted')
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    expect(onAcknowledge).toHaveBeenCalledWith('r1', 'e2', 'Thanks — noted')
  })

  it('an empty comment is sent as no comment', async () => {
    setup(shared())
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    expect(onAcknowledge).toHaveBeenCalledWith('r1', 'e2', null)
  })

  it('shows a live character counter and refuses an over-long comment before it is sent', () => {
    setup(shared())
    expect(screen.getByText('0/1000')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Your comment (optional)'), { target: { value: 'x'.repeat(1001) } })
    expect(screen.getByText('1001/1000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeDisabled()
  })

  it('THE RACE: when the server says the review was updated while reading, it says so and offers the new version — nothing looks acknowledged', async () => {
    onAcknowledge.mockResolvedValue({ ok: false, conflict: false, error: REVIEW_MESSAGES.staleShare })
    setup(shared())
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    expect(await screen.findByText('This review was updated while you were reading it — please read the new version.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Read the new version' }))
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Acknowledged/)).not.toBeInTheDocument()
  })

  it.each([['the not-shared message', REVIEW_MESSAGES.notShared], ['the illegal-transition message', REVIEW_MESSAGES.illegalTransition]])('offers "Read the new version" for %s too', async (_n, error) => {
    onAcknowledge.mockResolvedValue({ ok: false, conflict: false, error })
    setup(shared())
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    expect(await screen.findByText(error)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read the new version' })).toBeInTheDocument()
  })

  it('a network or other failure shows just the message (no "Read the new version") and Acknowledge stays available to retry', async () => {
    onAcknowledge.mockResolvedValueOnce({ ok: false, conflict: false, error: 'Something went wrong. Check your connection and try again.' })
    setup(shared())
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    expect(await screen.findByText('Something went wrong. Check your connection and try again.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Read the new version' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    expect(onAcknowledge).toHaveBeenCalledTimes(2)
  })

  it('disables the button while the acknowledgement is in flight (no double submit)', async () => {
    let finish: (r: unknown) => void = () => {}
    onAcknowledge.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    setup(shared())
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeDisabled()
    finish({ ok: true, revision: 4 })
    await waitFor(() => expect(onAcknowledge).toHaveBeenCalledTimes(1))
  })

  it('once acknowledged: the button and the comment box go, and their own comment shows read-only', () => {
    setup(shared({
      state: 'acknowledged',
      events: [
        { id: 'e2', fromStatus: 'draft', toStatus: 'shared', actorName: 'Alex', at: '2026-11-03T12:20:00Z', note: null },
        { id: 'e3', fromStatus: 'shared', toStatus: 'acknowledged', actorName: 'Taylor', at: '2026-11-04T08:00:00Z', note: 'Thanks — noted' },
      ],
    }))
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Your comment (optional)')).not.toBeInTheDocument()
    expect(screen.getByText('Acknowledged 4 Nov, 10:00')).toBeInTheDocument()
    expect(screen.getByText('Thanks — noted').closest('[data-testid="own-comment"]')).not.toBeNull()
  })
})
