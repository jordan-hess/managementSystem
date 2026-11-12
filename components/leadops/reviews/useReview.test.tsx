import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useReview } from './useReview'
import { REVIEW_MESSAGES as M } from '@/lib/leadops/reviewLimits'

jest.mock('@/lib/leadops/reviewActions', () => ({
  fetchLeadOpsReviewAction: jest.fn(),
  saveReviewDraftAction: jest.fn(),
  shareReviewAction: jest.fn(),
  acknowledgeReviewAction: jest.fn(),
  markReviewViewedAction: jest.fn(),
  reopenReviewAction: jest.fn(),
}))
import {
  acknowledgeReviewAction, fetchLeadOpsReviewAction, markReviewViewedAction, reopenReviewAction, saveReviewDraftAction, shareReviewAction,
} from '@/lib/leadops/reviewActions'

const fetchMock = fetchLeadOpsReviewAction as jest.Mock
const saveMock = saveReviewDraftAction as jest.Mock
const shareMock = shareReviewAction as jest.Mock
const ackMock = acknowledgeReviewAction as jest.Mock
const viewedMock = markReviewViewedAction as jest.Mock
const reopenMock = reopenReviewAction as jest.Mock

const view = (revision: number) => ({ kind: 'reviewer', review: { id: 'r1', revision }, events: [], changes: [] })
const results: Record<string, unknown> = {}

function Probe({ tl = 'tl-1', period = '2026-10-01', enabled = true }: { tl?: string; period?: string; enabled?: boolean }) {
  const r = useReview(tl, period, enabled)
  // eslint-disable-next-line react-hooks/immutability -- test probe publishes the hook result to the test
  results.current = r
  return (
    <div>
      <span data-testid="loading">{String(r.loading)}</span>
      <span data-testid="error">{r.error ?? ''}</span>
      <span data-testid="revision">{r.view && r.view.kind === 'reviewer' ? r.view.review?.revision : ''}</span>
      <button onClick={() => r.reload()}>reload</button>
    </div>
  )
}
const text = (id: string) => screen.getByTestId(id).textContent
const hook = () => results.current as ReturnType<typeof useReview>
/** Runs an action inside act so its fire-and-forget refresh settles in act too. */
const inAct = async <T,>(fn: () => Promise<T>): Promise<T> => {
  let out!: T
  await act(async () => { out = await fn() })
  return out
}

beforeEach(() => {
  for (const m of [fetchMock, saveMock, shareMock, ackMock, viewedMock, reopenMock]) m.mockReset()
  fetchMock.mockResolvedValue({ data: view(2) })
})

describe('useReview — loading', () => {
  it('loads the review for the team leader and month and exposes it', async () => {
    render(<Probe />)
    expect(text('loading')).toBe('true')
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(fetchMock).toHaveBeenCalledWith('tl-1', '2026-10-01')
    expect(text('revision')).toBe('2')
  })

  it('does not fetch when disabled or when no team leader is selected', async () => {
    render(<Probe enabled={false} />)
    render(<Probe tl="" />)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a refused or thrown load is an error state, never an empty review', async () => {
    fetchMock.mockResolvedValue({ error: M.loadFailed })
    const first = render(<Probe />)
    await waitFor(() => expect(text('error')).toBe(M.loadFailed))
    first.unmount()
    fetchMock.mockRejectedValue(new Error('network'))
    render(<Probe />)
    await waitFor(() => expect(text('error')).toBe(M.loadFailed))
  })

  it('shows loading — never the previous view — when the month changes, even back to a month it already had (A -> B -> A before B returns)', async () => {
    let resolveB: (v: unknown) => void = () => {}
    const { rerender } = render(<Probe period="2026-10-01" />)
    await waitFor(() => expect(text('loading')).toBe('false'))
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve })) // B never answers in time
    rerender(<Probe period="2026-09-01" />)
    expect(text('loading')).toBe('true')
    fetchMock.mockResolvedValue({ data: view(7) })
    rerender(<Probe period="2026-10-01" />)
    expect(text('loading')).toBe('true') // the stale A is not shown while the fresh A loads
    await waitFor(() => expect(text('revision')).toBe('7'))
    resolveB({ data: view(99) }) // a late answer for B is ignored
    await act(async () => {})
    expect(text('revision')).toBe('7')
  })

  it('reload() shows loading and fetches again', async () => {
    render(<Probe />)
    await waitFor(() => expect(text('loading')).toBe('false'))
    fetchMock.mockResolvedValue({ data: view(5) })
    fireEvent.click(screen.getByText('reload'))
    expect(text('loading')).toBe('true')
    await waitFor(() => expect(text('revision')).toBe('5'))
    expect(hook().reloadCount).toBe(1)
  })

  it('refresh() updates the view WITHOUT showing loading', async () => {
    render(<Probe />)
    await waitFor(() => expect(text('loading')).toBe('false'))
    fetchMock.mockResolvedValue({ data: view(6) })
    await act(async () => { await hook().refresh() })
    expect(text('loading')).toBe('false')
    expect(text('revision')).toBe('6')
  })

  it('peekRevision() returns the stored revision without touching the screen, and null on any failure', async () => {
    render(<Probe />)
    await waitFor(() => expect(text('loading')).toBe('false'))
    fetchMock.mockResolvedValue({ data: view(9) })
    expect(await hook().peekRevision()).toBe(9)
    expect(text('revision')).toBe('2')
    fetchMock.mockResolvedValue({ error: M.loadFailed })
    expect(await hook().peekRevision()).toBeNull()
    fetchMock.mockRejectedValue(new Error('x'))
    expect(await hook().peekRevision()).toBeNull()
  })

  it('refresh() held pending keeps loading false and the OLD view visible, then shows the new view', async () => {
    render(<Probe />)
    await waitFor(() => expect(text('loading')).toBe('false'))
    let resolveR: (v: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveR = resolve }))
    let pending: Promise<void> = Promise.resolve()
    act(() => { pending = hook().refresh() })
    expect(text('loading')).toBe('false')
    expect(text('revision')).toBe('2')
    await act(async () => { resolveR({ data: view(8) }); await pending })
    expect(text('loading')).toBe('false')
    expect(text('revision')).toBe('8')
  })

  it('a failed refresh (refused or thrown) leaves the view unchanged', async () => {
    render(<Probe />)
    await waitFor(() => expect(text('loading')).toBe('false'))
    fetchMock.mockResolvedValue({ error: M.loadFailed })
    await act(async () => { await hook().refresh() })
    expect(text('revision')).toBe('2')
    expect(text('error')).toBe('')
    fetchMock.mockRejectedValue(new Error('x'))
    await act(async () => { await hook().refresh() })
    expect(text('revision')).toBe('2')
    expect(text('error')).toBe('')
  })

  it('a refresh that resolves after the month changed does not write into the new key', async () => {
    const { rerender } = render(<Probe period="2026-10-01" />)
    await waitFor(() => expect(text('loading')).toBe('false'))
    let resolveR: (v: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveR = resolve }))
    let pending: Promise<void> = Promise.resolve()
    act(() => { pending = hook().refresh() }) // refresh for the OLD month
    fetchMock.mockResolvedValue({ data: view(4) })
    rerender(<Probe period="2026-09-01" />)
    await waitFor(() => expect(text('revision')).toBe('4'))
    await act(async () => { resolveR({ data: view(99) }); await pending })
    expect(text('revision')).toBe('4')
  })

  it('peekRevision() is null for a team leader view and 0 for a reviewer view with no review yet', async () => {
    render(<Probe />)
    await waitFor(() => expect(text('loading')).toBe('false'))
    fetchMock.mockResolvedValue({ data: { kind: 'team_leader', state: 'none', reviewId: null, shared: null, events: [] } })
    expect(await hook().peekRevision()).toBeNull()
    fetchMock.mockResolvedValue({ data: { kind: 'reviewer', review: null, events: [], changes: [] } })
    expect(await hook().peekRevision()).toBe(0)
  })
})

describe('useReview — actions', () => {
  beforeEach(async () => {
    render(<Probe />)
    await waitFor(() => expect(text('loading')).toBe('false'))
  })
  afterEach(async () => { await act(async () => {}) }) // flush the fire-and-forget refresh after an action

  it('saveDraft sends the team leader and month, resolves ok with the new revision, and refreshes', async () => {
    saveMock.mockResolvedValue({ data: { revision: 3, unshared: false } })
    const input = { expectedRevision: 2, notes: 'n', agreedActions: 'a', confirmUnshare: false }
    expect(await inAct(() => hook().saveDraft(input))).toEqual({ ok: true, revision: 3, unshared: false })
    expect(saveMock).toHaveBeenCalledWith({ tlId: 'tl-1', period: '2026-10-01', ...input })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)) // the load and the refresh
  })

  it('a revision conflict resolves as a conflict (the screen offers the choices); another refusal is not', async () => {
    saveMock.mockResolvedValue({ error: M.conflict })
    expect(await inAct(() => hook().saveDraft({ expectedRevision: 2, notes: null, agreedActions: null, confirmUnshare: false }))).toEqual({ ok: false, conflict: true, error: M.conflict })
    saveMock.mockResolvedValue({ error: M.confirmUnshare })
    expect(await inAct(() => hook().saveDraft({ expectedRevision: 2, notes: null, agreedActions: null, confirmUnshare: false }))).toEqual({ ok: false, conflict: false, error: M.confirmUnshare })
  })

  it('a thrown call is reported as unreachable, not as a crash', async () => {
    shareMock.mockRejectedValue(new Error('Failed to fetch'))
    expect(await inAct(() => hook().share(2))).toEqual({ ok: false, conflict: false, error: 'The server could not be reached — reload the page and try again.' })
  })

  it('share, acknowledge and reopen pass their arguments through', async () => {
    shareMock.mockResolvedValue({ data: { revision: 3, shareEventId: 'e9' } })
    expect(await inAct(() => hook().share(2))).toEqual({ ok: true, revision: 3, shareEventId: 'e9' })
    expect(shareMock).toHaveBeenCalledWith({ tlId: 'tl-1', period: '2026-10-01', expectedRevision: 2 })

    ackMock.mockResolvedValue({ data: { revision: 4 } })
    expect(await inAct(() => hook().acknowledge('r1', 'e9', 'Thanks'))).toEqual({ ok: true, revision: 4 })
    expect(ackMock).toHaveBeenCalledWith({ reviewId: 'r1', shareEventId: 'e9', note: 'Thanks' })

    reopenMock.mockResolvedValue({ data: { revision: 5 } })
    expect(await inAct(() => hook().reopen('r1', 'Fix it'))).toEqual({ ok: true, revision: 5 })
    expect(reopenMock).toHaveBeenCalledWith({ reviewId: 'r1', reason: 'Fix it' })
  })

  it('markViewed fires the call and never throws, even if the call fails', async () => {
    viewedMock.mockRejectedValue(new Error('x'))
    await expect(hook().markViewed('r1', 'e9')).resolves.toBeUndefined()
    expect(viewedMock).toHaveBeenCalledWith({ reviewId: 'r1', shareEventId: 'e9' })
  })
})
