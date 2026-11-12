import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PerformanceReviewTab from './PerformanceReviewTab'
import type { LeadOpsViewerContext } from '@/lib/leadops/permissions'

jest.mock('@/lib/leadops/reviewActions', () => ({
  fetchLeadOpsReviewAction: jest.fn(),
  fetchReviewRosterAction: jest.fn(),
  saveReviewDraftAction: jest.fn(),
  shareReviewAction: jest.fn(),
  acknowledgeReviewAction: jest.fn(),
  markReviewViewedAction: jest.fn(),
  reopenReviewAction: jest.fn(),
}))
// The two screens have their own suites — here they only show which one the shell chose and what it gave it.
jest.mock('./reviews/TeamLeaderReview', () => ({
  __esModule: true,
  default: (p: { view: { state: string }; period: string }) => <div data-testid="tl-screen">{p.view.state}|{p.period}</div>,
}))
// The real screen reads its props ONCE at mount, so this stand-in snapshots them at mount too: the snapshot only changes if the shell remounts it.
jest.mock('./reviews/ReviewerReview', () => ({
  __esModule: true,
  default: function MockReviewerReview(p: { tlId: string; tlName: string; period: string; isHod: boolean; view: { marker?: string }; onReload: () => void }) {
    const [seen] = useState(() => ({ tlId: p.tlId, period: p.period, marker: p.view.marker }))
    return (
      <div>
        <div data-testid="reviewer-screen">{p.tlId}|{p.tlName}|{p.period}|{String(p.isHod)}</div>
        <div data-testid="mounted-with">{seen.tlId}|{seen.period}|{seen.marker}</div>
        <button type="button" onClick={p.onReload}>screen reload</button>
      </div>
    )
  },
}))
import { fetchLeadOpsReviewAction, fetchReviewRosterAction } from '@/lib/leadops/reviewActions'

const fetchReview = fetchLeadOpsReviewAction as jest.Mock
const fetchRoster = fetchReviewRosterAction as jest.Mock

const TODAY = '2026-10-10' // September has finished, October has not
const tlViewer: LeadOpsViewerContext = { role: 'admin', hasTeamRow: true, profileId: 'tl-1' }
const managementViewer: LeadOpsViewerContext = { role: 'management', hasTeamRow: false, profileId: 'mgmt-1' }
const hodViewer: LeadOpsViewerContext = { role: 'hod', hasTeamRow: false, profileId: 'hod-1' }
const plainAdmin: LeadOpsViewerContext = { role: 'admin', hasTeamRow: false, profileId: 'adm-1' }

const reviewerView = { kind: 'reviewer', review: null, live: {}, changes: [], events: [], seenByTeamLeader: false, previousComment: null }
const tlView = { kind: 'team_leader', state: 'shared', reviewId: 'r1', shared: null }
const roster = [
  { id: 'a', name: 'Taylor', status: 'shared' },
  { id: 'b', name: 'Thabo', status: null },
]

beforeEach(() => {
  fetchReview.mockReset()
  fetchRoster.mockReset()
  fetchReview.mockResolvedValue({ data: reviewerView })
  fetchRoster.mockResolvedValue({ data: roster })
})

describe('PerformanceReviewTab', () => {
  it('shows a viewer who may not see team leader data a notice and calls nothing', async () => {
    render(<PerformanceReviewTab viewer={plainAdmin} today={TODAY} />)
    expect(screen.getByText('No performance review to show')).toBeInTheDocument()
    expect(fetchReview).not.toHaveBeenCalled()
    expect(fetchRoster).not.toHaveBeenCalled()
  })

  it('a team leader reviews themself for the newest finished month, with no picker and no roster call', async () => {
    fetchReview.mockResolvedValue({ data: tlView })
    render(<PerformanceReviewTab viewer={tlViewer} today={TODAY} />)
    expect(await screen.findByTestId('tl-screen')).toHaveTextContent('shared|2026-09-01')
    expect(fetchReview).toHaveBeenCalledWith('tl-1', '2026-09-01')
    expect(screen.queryByLabelText('Team leader')).not.toBeInTheDocument()
    expect(fetchRoster).not.toHaveBeenCalled()
  })

  it.each([['management', managementViewer, 'false'], ['an HOD', hodViewer, 'true']])('%s picks a person from the roster, with each month status shown', async (_n, viewer, isHod) => {
    render(<PerformanceReviewTab viewer={viewer} today={TODAY} />)
    expect(await screen.findByTestId('reviewer-screen')).toHaveTextContent(`a|Taylor|2026-09-01|${isHod}`)
    expect(fetchRoster).toHaveBeenCalledWith('2026-09-01')
    const picker = screen.getByLabelText('Team leader')
    expect(picker).toHaveTextContent('Taylor — Shared')
    expect(picker).toHaveTextContent('Thabo — No review yet')
    fireEvent.change(picker, { target: { value: 'b' } })
    await waitFor(() => expect(screen.getByTestId('reviewer-screen')).toHaveTextContent(`b|Thabo|2026-09-01|${isHod}`))
    expect(fetchReview).toHaveBeenLastCalledWith('b', '2026-09-01')
  })

  it('shows loading — never the previous month — when the month changes, and loads the new month', async () => {
    render(<PerformanceReviewTab viewer={managementViewer} today={TODAY} />)
    await screen.findByTestId('reviewer-screen')
    fetchRoster.mockResolvedValue({ data: roster })
    fetchReview.mockReturnValue(new Promise(() => {})) // never settles: the new month stays loading
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-08-01' } })
    expect(screen.queryByTestId('reviewer-screen')).not.toBeInTheDocument()
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
    await waitFor(() => expect(fetchRoster).toHaveBeenLastCalledWith('2026-08-01'))
  })

  it('a failed roster is an error with Try again and loads no review; Try again loads the roster and then the review', async () => {
    fetchRoster.mockResolvedValueOnce({ error: 'Could not load this review.' }).mockResolvedValue({ data: roster })
    render(<PerformanceReviewTab viewer={managementViewer} today={TODAY} />)
    expect(await screen.findByText('Could not load this review.')).toBeInTheDocument()
    expect(fetchReview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('reviewer-screen')).toBeInTheDocument()
    expect(fetchRoster).toHaveBeenCalledTimes(2)
  })

  it('an empty roster says so instead of showing a blank screen', async () => {
    fetchRoster.mockResolvedValue({ data: [] })
    render(<PerformanceReviewTab viewer={hodViewer} today={TODAY} />)
    expect(await screen.findByText(/No team leaders to review/)).toBeInTheDocument()
    expect(fetchReview).not.toHaveBeenCalled()
  })

  it('a failed review load is an error with Try again, which loads it again', async () => {
    fetchReview.mockResolvedValueOnce({ error: 'Could not load this review.' }).mockResolvedValue({ data: reviewerView })
    render(<PerformanceReviewTab viewer={managementViewer} today={TODAY} />)
    expect(await screen.findByText('Could not load this review.')).toBeInTheDocument()
    expect(screen.queryByTestId('reviewer-screen')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('reviewer-screen')).toBeInTheDocument()
    expect(fetchReview).toHaveBeenCalledTimes(2)
  })

  it('a team leader never gets the reviewer screen, even if the server answers with a reviewer view', async () => {
    fetchReview.mockResolvedValue({ data: reviewerView })
    render(<PerformanceReviewTab viewer={tlViewer} today={TODAY} />)
    expect(await screen.findByText('Could not load this review.')).toBeInTheDocument()
    expect(screen.queryByTestId('reviewer-screen')).not.toBeInTheDocument()
  })

  describe('remounts the reviewer screen (it reads its props once at mount)', () => {
    const mountedWith = () => screen.getByTestId('mounted-with').textContent

    it('mounts it afresh for another person', async () => {
      render(<PerformanceReviewTab viewer={managementViewer} today={TODAY} />)
      await waitFor(() => expect(mountedWith()).toBe('a|2026-09-01|'))
      fireEvent.change(screen.getByLabelText('Team leader'), { target: { value: 'b' } })
      await waitFor(() => expect(mountedWith()).toBe('b|2026-09-01|'))
    })

    it('mounts it afresh for another month', async () => {
      render(<PerformanceReviewTab viewer={managementViewer} today={TODAY} />)
      await waitFor(() => expect(mountedWith()).toBe('a|2026-09-01|'))
      fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-08-01' } })
      await waitFor(() => expect(mountedWith()).toBe('a|2026-08-01|'))
    })

    it('mounts it afresh when the screen asks for a reload, showing the freshly loaded view', async () => {
      fetchReview.mockResolvedValueOnce({ data: { ...reviewerView, marker: 'first' } }).mockResolvedValue({ data: { ...reviewerView, marker: 'second' } })
      render(<PerformanceReviewTab viewer={managementViewer} today={TODAY} />)
      await waitFor(() => expect(mountedWith()).toBe('a|2026-09-01|first'))
      fireEvent.click(screen.getByRole('button', { name: 'screen reload' }))
      await waitFor(() => expect(mountedWith()).toBe('a|2026-09-01|second'))
      expect(fetchReview).toHaveBeenCalledTimes(2)
    })

    it('does not remount on a plain re-render', async () => {
      fetchReview.mockResolvedValue({ data: { ...reviewerView, marker: 'first' } })
      const { rerender } = render(<PerformanceReviewTab viewer={managementViewer} today={TODAY} />)
      await waitFor(() => expect(mountedWith()).toBe('a|2026-09-01|first'))
      fetchReview.mockResolvedValue({ data: { ...reviewerView, marker: 'second' } })
      rerender(<PerformanceReviewTab viewer={managementViewer} today={TODAY} />)
      await act(async () => {})
      expect(mountedWith()).toBe('a|2026-09-01|first')
      expect(fetchReview).toHaveBeenCalledTimes(1)
    })
  })
})
