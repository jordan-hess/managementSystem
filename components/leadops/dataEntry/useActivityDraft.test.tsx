import { fireEvent, render, screen } from '@testing-library/react'
import { useActivityDraft } from './useActivityDraft'
import { DRAFT_MAX_AGE_MS, draftKey, loadDraft, saveDraft } from '@/lib/leadops/activityDrafts'

interface Values { a: string }
const KEY = draftKey('daily', 'tl-1', '2026-10-08')

function Harness({ enabled = true, server = null }: { enabled?: boolean; server?: Values | null }) {
  const d = useActivityDraft<Values>(KEY, enabled, server)
  return (
    <div>
      <span data-testid="restored">{d.restored ? JSON.stringify(d.restored) : ''}</span>
      <span data-testid="pending">{d.pending ? JSON.stringify(d.pending) : ''}</span>
      <button onClick={() => d.persist({ a: 'typed' })}>persist</button>
      <button onClick={d.clear}>clear</button>
      <button onClick={d.discard}>discard</button>
      <button onClick={() => d.acceptPending({ a: 'accepted' })}>accept</button>
    </div>
  )
}
const text = (id: string) => screen.getByTestId(id).textContent

beforeEach(() => localStorage.clear())

describe('useActivityDraft', () => {
  it('offers a stored draft to start the form from when nothing is saved for this day/week', () => {
    saveDraft(KEY, { a: 'x' })
    render(<Harness server={null} />)
    expect(text('restored')).toBe('{"a":"x"}')
    expect(text('pending')).toBe('')
  })

  it('offers a draft that differs from the saved entry as a choice, never applying it', () => {
    saveDraft(KEY, { a: 'draft' })
    render(<Harness server={{ a: 'saved' }} />)
    expect(text('pending')).toBe('{"a":"draft"}')
    expect(text('restored')).toBe('')
  })

  it('hides a draft that equals the saved entry but never deletes it (only a confirmed save does — the "saved" row may be an unconfirmed optimistic one)', () => {
    saveDraft(KEY, { a: 'same' })
    render(<Harness server={{ a: 'same' }} />)
    expect(text('pending')).toBe('')
    expect(text('restored')).toBe('')
    expect(loadDraft(KEY)).toEqual({ a: "same" })
  })

  it('persist writes the values; clear removes them', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('persist'))
    expect(loadDraft(KEY)).toEqual({ a: 'typed' })
    fireEvent.click(screen.getByText('clear'))
    expect(loadDraft(KEY)).toBeNull()
  })

  it('discard removes the draft and hides the offer; accept hides the offer and stores what was applied', () => {
    saveDraft(KEY, { a: 'draft' })
    const { unmount } = render(<Harness server={{ a: 'saved' }} />)
    fireEvent.click(screen.getByText('accept'))
    expect(text('pending')).toBe('')
    expect(loadDraft(KEY)).toEqual({ a: 'accepted' }) // storing what Use them applied
    unmount()

    render(<Harness server={{ a: 'saved' }} />)
    expect(text('pending')).toBe('{"a":"accepted"}')
    fireEvent.click(screen.getByText('discard'))
    expect(text('pending')).toBe('')
    expect(loadDraft(KEY)).toBeNull()
  })

  it('when disabled it reads, writes and prunes nothing', () => {
    saveDraft(KEY, { a: 'x' })
    saveDraft(draftKey('daily', 'tl-1', '2026-09-01'), { a: 'old' }, Date.now() - DRAFT_MAX_AGE_MS - 1)
    render(<Harness enabled={false} />)
    expect(text('restored')).toBe('')
    fireEvent.click(screen.getByText('persist'))
    expect(loadDraft(KEY)).toEqual({ a: 'x' }) // untouched by persist
    expect(localStorage.getItem(draftKey('daily', 'tl-1', '2026-09-01'))).not.toBeNull() // not pruned
  })

  it('prunes expired drafts of other days when it mounts enabled', () => {
    saveDraft(draftKey('daily', 'tl-1', '2026-09-01'), { a: 'old' }, Date.now() - DRAFT_MAX_AGE_MS - 1)
    render(<Harness />)
    expect(localStorage.getItem(draftKey('daily', 'tl-1', '2026-09-01'))).toBeNull()
  })
})
