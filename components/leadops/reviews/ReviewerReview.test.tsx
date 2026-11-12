import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReviewerReview from './ReviewerReview'
import { draftKey, loadDraft } from '@/lib/leadops/activityDrafts'
import { buildReviewSnapshot } from '@/lib/leadops/reviewSnapshot'
import type { ReviewerReviewView } from '@/lib/leadops/reviewActions'

const WEEKLY = { weeks: 4, calibrationAttended: 3, coachingSessions: 9, agentInSeatDays: 2, criticalFails: 1, reAudits: 6 }
const live = buildReviewSnapshot({ period: '2026-09-01', teamLeaderName: 'Taylor', sharedByName: null, takenAt: '2026-10-05T10:00:00.000Z', scores: [], weekly: WEEKLY })
const frozen = buildReviewSnapshot({ period: '2026-09-01', teamLeaderName: 'Taylor', sharedByName: 'Alex', takenAt: '2026-10-03T12:20:00.000Z', scores: [], weekly: WEEKLY })

const record = (over = {}) => ({
  id: 'r1', tlId: 'tl-1', tlName: 'Taylor', period: '2026-09-01', status: 'draft' as const, notes: 'Strong month', agreedActions: '1. Protect 10:30', revision: 3,
  createdByName: 'Alex', lastEditedByName: 'Alex', sharedByName: null, currentShareEventId: null, tlViewedEventId: null, updatedAt: '', ...over,
})
const view = (over: Partial<ReviewerReviewView> = {}): ReviewerReviewView => ({
  kind: 'reviewer', review: record(), live, changes: [], events: [], seenByTeamLeader: false, previousComment: null, ...over,
})
const sharedView = (over: Partial<ReviewerReviewView> = {}) => view({
  review: record({ status: 'shared', currentShareEventId: 'e2', sharedByName: 'Alex' }),
  events: [{ id: 'e2', fromStatus: 'draft', toStatus: 'shared', actorName: 'Alex', at: '2026-10-03T12:20:00Z', note: null, reason: null, notesCopy: 'Strong month', actionsCopy: '1. Protect 10:30', snapshot: frozen, snapshotVersion: 1 }],
  ...over,
})

const onSave = jest.fn()
const onShare = jest.fn()
const onReopen = jest.fn()
const onReload = jest.fn()
const onPeekRevision = jest.fn()

const setup = (v: ReviewerReviewView = view(), props: { isHod?: boolean; todayDate?: string } = {}) =>
  render(<ReviewerReview tlId="tl-1" tlName="Taylor" period="2026-09-01" todayDate={props.todayDate ?? '2026-10-10'} view={v} isHod={props.isHod ?? false}
    onSave={onSave} onShare={onShare} onReopen={onReopen} onReload={onReload} onPeekRevision={onPeekRevision} />)

const notesBox = () => screen.getByLabelText('Notes') as HTMLTextAreaElement
const saveBtn = () => screen.getByRole('button', { name: 'Save' })
const KEY = draftKey('review', 'tl-1', '2026-09-01')

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  onSave.mockResolvedValue({ ok: true, revision: 4, unshared: false })
  onShare.mockResolvedValue({ ok: true, revision: 5, shareEventId: 'e9' })
  onReopen.mockResolvedValue({ ok: true, revision: 6 })
})

describe('ReviewerReview — editing a draft', () => {
  it('shows the stored notes and agreed actions with live character counters', () => {
    setup()
    expect(notesBox().value).toBe('Strong month')
    expect(screen.getByText('12/8000')).toBeInTheDocument()
    expect(screen.getByText('16/4000')).toBeInTheDocument()
  })

  it('flags an over-limit (pasted) text instead of cutting it, and refuses to save it', () => {
    setup()
    fireEvent.change(notesBox(), { target: { value: 'x'.repeat(8001) } })
    expect(screen.getByText('8001/8000')).toBeInTheDocument()
    expect(saveBtn()).toBeDisabled()
    expect(notesBox().value).toHaveLength(8001) // nothing was silently cut
  })

  it('Save sends the revision the screen was opened on, and the edited text', async () => {
    setup()
    await userEvent.type(notesBox(), '!')
    await userEvent.click(saveBtn())
    expect(onSave).toHaveBeenCalledWith({ expectedRevision: 3, notes: 'Strong month!', agreedActions: '1. Protect 10:30', confirmUnshare: false })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('THE REVISION IS OWNED BY THE SCREEN: if the shown view later reports a newer revision (another device saved), Save still sends the revision it was opened on — so the server reports a conflict instead of overwriting', async () => {
    const { rerender } = setup()
    rerender(<ReviewerReview tlId="tl-1" tlName="Taylor" period="2026-09-01" todayDate="2026-10-10" view={view({ review: record({ revision: 9 }) })} isHod={false}
      onSave={onSave} onShare={onShare} onReopen={onReopen} onReload={onReload} onPeekRevision={onPeekRevision} />)
    await userEvent.type(notesBox(), '!')
    await userEvent.click(saveBtn())
    expect(onSave.mock.calls[0][0].expectedRevision).toBe(3)
  })

  it('after a confirmed save the next save uses the new revision', async () => {
    setup()
    await userEvent.type(notesBox(), '!')
    await userEvent.click(saveBtn())
    await screen.findByText('Saved')
    await userEvent.type(notesBox(), '?')
    await userEvent.click(saveBtn())
    expect(onSave.mock.calls[1][0].expectedRevision).toBe(4)
  })

  it('creating a review that does not exist yet saves against revision 0', async () => {
    setup(view({ review: null }))
    await userEvent.type(notesBox(), 'First thoughts')
    await userEvent.click(saveBtn())
    expect(onSave.mock.calls[0][0]).toMatchObject({ expectedRevision: 0, notes: 'First thoughts' })
  })

  it('locks the fields while a save is in flight', async () => {
    let finish: (r: unknown) => void = () => {}
    onSave.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    setup()
    await userEvent.type(notesBox(), '!')
    fireEvent.click(saveBtn())
    expect(notesBox()).toBeDisabled()
    finish({ ok: true, revision: 4, unshared: false })
    await waitFor(() => expect(notesBox()).not.toBeDisabled())
  })
})

describe('ReviewerReview — editing a shared review unshares it', () => {
  it('the fields are read-only behind "Edit review", and the first edit asks for confirmation with the exact warning', async () => {
    setup(sharedView())
    expect(notesBox()).toHaveAttribute('readonly')
    await userEvent.click(screen.getByRole('button', { name: 'Edit review' }))
    expect(screen.getByText('Editing will unshare this review until you share it again.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(notesBox()).toHaveAttribute('readonly') // cancelling changes nothing
  })

  it('after confirming, the text is editable and Save sends confirmUnshare: true', async () => {
    onSave.mockResolvedValue({ ok: true, revision: 4, unshared: true })
    setup(sharedView())
    await userEvent.click(screen.getByRole('button', { name: 'Edit review' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit and unshare' }))
    await userEvent.type(notesBox(), '!')
    await userEvent.click(saveBtn())
    expect(onSave).toHaveBeenCalledWith({ expectedRevision: 3, notes: 'Strong month!', agreedActions: '1. Protect 10:30', confirmUnshare: true })
  })
})

describe('ReviewerReview — sharing', () => {
  it('Share is disabled while there are unsaved changes', async () => {
    setup()
    expect(screen.getByRole('button', { name: 'Share with team leader' })).toBeEnabled()
    await userEvent.type(notesBox(), '!')
    expect(screen.getByRole('button', { name: 'Share with team leader' })).toBeDisabled()
  })

  it('a finished month is shared straight away, against the screen\'s revision', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Share with team leader' }))
    expect(onShare).toHaveBeenCalledWith(3)
  })

  it('an unfinished month asks first: "<Month> isn\'t finished — figures may still change before you share."', async () => {
    setup(view(), { todayDate: '2026-09-20' })
    await userEvent.click(screen.getByRole('button', { name: 'Share with team leader' }))
    expect(screen.getByText("September isn't finished — figures may still change before you share.")).toBeInTheDocument()
    expect(onShare).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Share anyway' }))
    expect(onShare).toHaveBeenCalledWith(3)
  })

  it('there is nothing to share before the first save', () => {
    setup(view({ review: null }))
    expect(screen.getByRole('button', { name: 'Share with team leader' })).toBeDisabled()
  })
})

describe('ReviewerReview — what the reviewer is told', () => {
  it('flags changed figures without any change to the review, with old and new side by side', () => {
    setup(sharedView({ changes: [{ label: 'Coaching sessions', before: '9', after: '11' }, { label: 'Re-audits', before: '6', after: '7' }] }))
    expect(screen.getByText('2 figures have changed since you shared this — re-share to update.')).toBeInTheDocument()
    const row = screen.getByText('Coaching sessions', { selector: 'td' }).closest('tr')!
    expect(row).toHaveTextContent('9')
    expect(row).toHaveTextContent('11')
  })

  it('on an acknowledged review the banner does not tell management to re-share (they cannot) — it says to ask the HOD to reopen', () => {
    setup(sharedView({ review: record({ status: 'acknowledged', currentShareEventId: 'e2', sharedByName: 'Alex' }), changes: [{ label: 'Re-audits', before: '6', after: '7' }] }))
    expect(screen.getByText('1 figure has changed since you shared this — ask the HOD to reopen this review to update it.')).toBeInTheDocument()
    expect(screen.queryByText(/re-share to update/)).not.toBeInTheDocument()
  })

  it('says "1 figure has changed" for one', () => {
    setup(sharedView({ changes: [{ label: 'Re-audits', before: '6', after: '7' }] }))
    expect(screen.getByText('1 figure has changed since you shared this — re-share to update.')).toBeInTheDocument()
  })

  it('shows "Seen by team leader" only when they have opened the current share', () => {
    setup(sharedView({ seenByTeamLeader: true }))
    expect(screen.getByText('Seen by team leader')).toBeInTheDocument()
  })

  it('shows the previous acknowledgement comment while the reviewer revises', () => {
    setup(view({ previousComment: { note: 'The 10:30 slot is never free', actorName: 'Taylor', at: '2026-10-04T08:00:00Z' } }))
    expect(screen.getByText('The 10:30 slot is never free')).toBeInTheDocument()
    expect(screen.getByText(/Taylor's previous comment/)).toBeInTheDocument()
  })

  it('an acknowledged review is locked and says what acknowledging means', () => {
    setup(sharedView({ review: record({ status: 'acknowledged', currentShareEventId: 'e2', sharedByName: 'Alex' }) }))
    expect(screen.getByText('Acknowledged — the team leader confirmed they have read this, not that they agree.')).toBeInTheDocument()
    expect(notesBox()).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Edit review' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('shows the history, and each share\'s copy of what was shared', () => {
    setup(sharedView())
    expect(screen.getByText(/Shared by Alex/)).toBeInTheDocument()
    expect(screen.getByText('What was shared')).toBeInTheDocument()
  })
})

describe('ReviewerReview — reopening (HOD only)', () => {
  const acknowledged = () => sharedView({ review: record({ status: 'acknowledged', currentShareEventId: 'e2', sharedByName: 'Alex' }) })

  it('is not offered to anyone but the HOD', () => {
    setup(acknowledged(), { isHod: false })
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument()
  })

  it('needs a reason, then reopens', async () => {
    setup(acknowledged(), { isHod: true })
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    const confirm = screen.getByRole('button', { name: 'Reopen review' })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'Add the VIP target')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    expect(onReopen).toHaveBeenCalledWith('r1', 'Add the VIP target')
  })

  const reopenModal = () => screen.getByText('Reopen this review').closest('div.relative') as HTMLElement

  it.each([
    ['a failure', { ok: false as const, conflict: false, error: 'The server could not be reached — reload the page and try again.' }],
    ['a conflict', { ok: false as const, conflict: true, error: 'This review was changed elsewhere since you opened it. Reload to see the latest version.' }],
  ])('%s shows its message INSIDE the open modal, and the modal stays open', async (_n, failure) => {
    onReopen.mockResolvedValueOnce(failure)
    setup(acknowledged(), { isHod: true })
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'Add the VIP target')
    await userEvent.click(screen.getByRole('button', { name: 'Reopen review' }))
    const alert = await within(reopenModal()).findByRole('alert')
    expect(alert).toHaveTextContent(failure.error)
    expect(screen.getAllByText(failure.error)).toHaveLength(1) // not also on the page behind the modal
    expect(screen.getByLabelText('Reason (required)')).toHaveValue('Add the VIP target')
  })

  it('the error clears when the reason changes, and when the modal is closed and opened again', async () => {
    onReopen.mockResolvedValueOnce({ ok: false, conflict: false, error: 'Reopen failed.' })
    setup(acknowledged(), { isHod: true })
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'Why')
    await userEvent.click(screen.getByRole('button', { name: 'Reopen review' }))
    await within(reopenModal()).findByRole('alert')
    await userEvent.type(screen.getByLabelText('Reason (required)'), '?')
    expect(within(reopenModal()).queryByRole('alert')).not.toBeInTheDocument()

    onReopen.mockResolvedValueOnce({ ok: false, conflict: false, error: 'Reopen failed again.' })
    await userEvent.click(screen.getByRole('button', { name: 'Reopen review' }))
    await within(reopenModal()).findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(within(reopenModal()).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('ReviewerReview — device drafts', () => {
  it('autosaves what is typed, restores it after a reload, and clears it only once the server confirms', async () => {
    const first = setup()
    await userEvent.type(notesBox(), '!')
    expect(loadDraft(KEY)).toEqual({ notes: 'Strong month!', agreedActions: '1. Protect 10:30' })
    first.unmount()

    onSave.mockResolvedValueOnce({ ok: false, conflict: false, error: 'The server could not be reached — reload the page and try again.' })
    setup(view({ review: null }))
    // no stored review: the draft is restored into the form
    expect(notesBox().value).toBe('Strong month!')
    expect(screen.getByText('Restored your unsent entry from this device — check it, then Save.')).toBeInTheDocument()
    await userEvent.click(saveBtn())
    expect(await screen.findByText(/Not saved yet/)).toBeInTheDocument()
    expect(loadDraft(KEY)).not.toBeNull() // a failed save keeps it

    onSave.mockResolvedValueOnce({ ok: true, revision: 1, unshared: false })
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(loadDraft(KEY)).toBeNull())
  })

  it('offers a draft that differs from the stored review as a choice, and never applies it silently', async () => {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), values: { notes: 'Different', agreedActions: 'x' } }))
    setup()
    expect(notesBox().value).toBe('Strong month')
    expect(screen.getByText('Unsent changes from this device differ from what is saved.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use them' }))
    expect(notesBox().value).toBe('Different')
  })
})

describe('ReviewerReview — a stale edit (revision conflict)', () => {
  const conflict = { ok: false as const, conflict: true, error: 'This review was changed elsewhere since you opened it. Reload to see the latest version.' }

  async function causeConflict() {
    onSave.mockResolvedValueOnce(conflict)
    setup()
    await userEvent.type(notesBox(), '!')
    await userEvent.click(saveBtn())
    await screen.findByText(/newer changes were saved elsewhere/i)
  }

  it('says so, offers the two choices, and keeps the draft', async () => {
    await causeConflict()
    expect(screen.getByRole('button', { name: 'Reload latest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Replace the saved review with my version/ })).toBeInTheDocument()
    expect(loadDraft(KEY)).not.toBeNull()
  })

  it('Reload latest reloads and keeps the draft', async () => {
    await causeConflict()
    await userEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(loadDraft(KEY)).not.toBeNull()
  })

  it('Replace warns it will overwrite; Cancel does nothing; Replace review fetches the current revision only AFTER confirming and saves against it', async () => {
    await causeConflict()
    onPeekRevision.mockResolvedValue(8)
    await userEvent.click(screen.getByRole('button', { name: /Replace the saved review with my version/ }))
    expect(screen.getByText(/Replacing the review will overwrite the changes that were saved since you opened it\. This cannot be undone from the app\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onPeekRevision).not.toHaveBeenCalled()
    expect(onSave).toHaveBeenCalledTimes(1)

    onSave.mockResolvedValueOnce({ ok: true, revision: 9, unshared: false })
    await userEvent.click(screen.getByRole('button', { name: /Replace the saved review with my version/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Replace review' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(onSave.mock.calls[1][0].expectedRevision).toBe(8)
    await waitFor(() => expect(loadDraft(KEY)).toBeNull())
  })

  it('if the latest revision cannot be fetched, nothing is sent and the draft stays', async () => {
    await causeConflict()
    onPeekRevision.mockResolvedValue(null)
    await userEvent.click(screen.getByRole('button', { name: /Replace the saved review with my version/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Replace review' }))
    await waitFor(() => expect(onPeekRevision).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(loadDraft(KEY)).not.toBeNull()
  })
})

describe('ReviewerReview — a dropped connection', () => {
  it('sends the unsent text again, with the latest text and the screen\'s revision, when the connection returns', async () => {
    onSave.mockResolvedValueOnce({ ok: false, conflict: false, error: 'The server could not be reached — reload the page and try again.' })
    setup()
    await userEvent.type(notesBox(), '!')
    await userEvent.click(saveBtn())
    await screen.findByText(/Not saved yet/)
    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(onSave.mock.calls[1][0]).toMatchObject({ expectedRevision: 3, notes: 'Strong month!' })
  })
})

describe('ReviewerReview — double submit', () => {
  it('Save clicked twice while the call is pending sends ONE request', async () => {
    let finish: (r: unknown) => void = () => {}
    onSave.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    setup()
    await userEvent.type(notesBox(), '!')
    const btn = saveBtn()
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(onSave).toHaveBeenCalledTimes(1)
    await act(async () => { finish({ ok: true, revision: 4, unshared: false }) })
  })

  it('Reopen clicked twice while the call is pending sends ONE request', async () => {
    let finish: (r: unknown) => void = () => {}
    onReopen.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    setup(sharedView({ review: record({ status: 'acknowledged', currentShareEventId: 'e2', sharedByName: 'Alex' }) }), { isHod: true })
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'Because')
    const confirm = screen.getByRole('button', { name: 'Reopen review' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(onReopen).toHaveBeenCalledTimes(1)
    await act(async () => { finish({ ok: true, revision: 6 }) })
  })
})

describe('ReviewerReview — fix round 1 (inside a shell that refreshes the view)', () => {
  const rerenderWith = (r: ReturnType<typeof setup>, v: ReviewerReviewView, isHod = false) =>
    r.rerender(<ReviewerReview tlId="tl-1" tlName="Taylor" period="2026-09-01" todayDate="2026-10-10" view={v} isHod={isHod}
      onSave={onSave} onShare={onShare} onReopen={onReopen} onReload={onReload} onPeekRevision={onPeekRevision} />)

  it('after a successful reopen the next save uses the revision the reopen returned', async () => {
    const r = setup(sharedView({ review: record({ status: 'acknowledged', revision: 5, currentShareEventId: 'e2', sharedByName: 'Alex' }) }), { isHod: true })
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'Because')
    await userEvent.click(screen.getByRole('button', { name: 'Reopen review' }))
    await waitFor(() => expect(onReopen).toHaveBeenCalled())
    rerenderWith(r, view({ review: record({ revision: 6 }) }), true)
    await userEvent.type(notesBox(), '!')
    await userEvent.click(saveBtn())
    expect(onSave.mock.calls[0][0].expectedRevision).toBe(6)
  })

  it('after a share, a second edit of the shared review asks for confirmation again', async () => {
    onSave.mockResolvedValue({ ok: true, revision: 4, unshared: true })
    const r = setup(sharedView())
    await userEvent.click(screen.getByRole('button', { name: 'Edit review' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit and unshare' }))
    await userEvent.type(notesBox(), '!')
    await userEvent.click(saveBtn())
    await screen.findByText('Saved')
    rerenderWith(r, view({ review: record({ revision: 4, notes: 'Strong month!' }) }))
    await userEvent.click(screen.getByRole('button', { name: 'Share with team leader' }))
    await waitFor(() => expect(onShare).toHaveBeenCalledWith(4))
    rerenderWith(r, sharedView({ review: record({ status: 'shared', revision: 5, notes: 'Strong month!', currentShareEventId: 'e2', sharedByName: 'Alex' }) }))
    expect(notesBox()).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Edit review' })).toBeInTheDocument()
    expect(saveBtn()).toBeDisabled()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('a confirmed edit of a shared review with changed figures can be saved unchanged (to unshare and re-share); unconfirmed it cannot', async () => {
    setup(sharedView({ changes: [{ label: 'Re-audits', before: '6', after: '7' }] }))
    expect(saveBtn()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Edit review' }))
    expect(saveBtn()).toBeDisabled() // not confirmed yet
    await userEvent.click(screen.getByRole('button', { name: 'Edit and unshare' }))
    expect(saveBtn()).toBeEnabled()
    await userEvent.click(saveBtn())
    expect(onSave).toHaveBeenCalledWith({ expectedRevision: 3, notes: 'Strong month', agreedActions: '1. Protect 10:30', confirmUnshare: true })
  })
})
