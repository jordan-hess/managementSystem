'use client'

import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { cardCls, mutedTextCls, sectionTitleCls } from '@/components/reports/theme'
import { draftKey } from '@/lib/leadops/activityDrafts'
import { MAX_REVIEW_ACTIONS, MAX_REVIEW_NOTES, MAX_REVIEW_REASON, isMonthFinished, monthName } from '@/lib/leadops/reviewLimits'
import type { ReviewerReviewView } from '@/lib/leadops/reviewActions'
import ActivityDraftNotice from '../dataEntry/ActivityDraftNotice'
import { useActivityDraft } from '../dataEntry/useActivityDraft'
import ReviewSnapshotView, { formatAsAt } from './ReviewSnapshotView'
import type { ReviewActionResult } from './useReview'
import { badgeCls, btnOutline, btnPrimary, btnSecondary, inputCls, labelCls } from '../statusStyles'

interface Props {
  tlId: string
  tlName: string
  period: string
  /** Today's South African date, for the "month isn't finished" warning. */
  todayDate: string
  view: ReviewerReviewView
  isHod: boolean
  onSave: (input: { expectedRevision: number; notes: string | null; agreedActions: string | null; confirmUnshare: boolean }) => Promise<ReviewActionResult<{ revision: number; unshared: boolean }>>
  onShare: (expectedRevision: number) => Promise<ReviewActionResult<{ revision: number; shareEventId: string }>>
  onReopen: (reviewId: string, reason: string) => Promise<ReviewActionResult<{ revision: number }>>
  onReload: () => void
  onPeekRevision: () => Promise<number | null>
}

interface Draft {
  notes: string
  agreedActions: string
}

const STATUS_CLS = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  shared: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  acknowledged: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
} as const

function Counter({ used, max }: { used: number; max: number }) {
  return <p className={`text-xs mt-1 ${used > max ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{used}/{max}</p>
}

/**
 * The reviewer's (management / HOD) view. Read once at mount: the shell remounts it per team leader, month and reload.
 * THE SCREEN OWNS ITS REVISION — captured at mount and moved only by a confirmed save/share — never read from props
 * that can change underneath it, so a save after another device has saved is a conflict, not an overwrite.
 */
export default function ReviewerReview({ tlId, tlName, period, todayDate, view, isHod, onSave, onShare, onReopen, onReload, onPeekRevision }: Props) {
  const review = view.review
  const status = review?.status ?? 'draft'
  const serverValues: Draft | null = review ? { notes: review.notes ?? '', agreedActions: review.agreedActions ?? '' } : null
  const drafts = useActivityDraft<Draft>(draftKey('review', tlId, period), true, serverValues)

  const [notes, setNotes] = useState(drafts.restored?.notes ?? review?.notes ?? '')
  const [actions, setActions] = useState(drafts.restored?.agreedActions ?? review?.agreedActions ?? '')
  const [baseline, setBaseline] = useState<Draft>({ notes: review?.notes ?? '', agreedActions: review?.agreedActions ?? '' })
  const revisionRef = useRef(review?.revision ?? 0)
  const latestRef = useRef<Draft>({ notes, agreedActions: actions })
  const sendingRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [unsent, setUnsent] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unshareConfirmed, setUnshareConfirmed] = useState(false)
  const [modal, setModal] = useState<null | 'edit' | 'early' | 'replace' | 'reopen'>(null)
  const [reopenReason, setReopenReason] = useState('')
  // A failed reopen is shown INSIDE its modal (the page-level alert sits behind it), and keeps the modal open.
  const [reopenError, setReopenError] = useState<string | null>(null)

  const dirty = notes !== baseline.notes || actions !== baseline.agreedActions
  const overLimit = notes.length > MAX_REVIEW_NOTES || actions.length > MAX_REVIEW_ACTIONS
  const lockedByStatus = status === 'acknowledged' || (status === 'shared' && !unshareConfirmed)
  const fieldsDisabled = saving || !!drafts.pending
  const shareEvent = review?.currentShareEventId ? view.events.find((e) => e.id === review.currentShareEventId) : undefined

  /** Every real edit updates the form AND the device draft. */
  function edit(next: Draft) {
    setNotes(next.notes)
    setActions(next.agreedActions)
    setSaved(false)
    latestRef.current = next
    drafts.persist(next)
  }

  async function send(expectedRevision: number, text: Draft): Promise<boolean> {
    if (sendingRef.current) return false // a send is already in flight (a double click, or Retry and the online event together)
    sendingRef.current = true
    setSaving(true)
    setSaved(false)
    setError(null)
    drafts.persist(text) // make sure the draft exists before the call, in case it never comes back
    const result = await onSave({
      expectedRevision,
      notes: text.notes === '' ? null : text.notes,
      agreedActions: text.agreedActions === '' ? null : text.agreedActions,
      confirmUnshare: unshareConfirmed,
    })
    sendingRef.current = false
    setSaving(false)
    if (result.ok) {
      revisionRef.current = result.revision
      setBaseline(text)
      setSaved(true)
      setUnsent(false)
      setConflict(false)
      drafts.clear() // the draft has done its job only once the server has confirmed
      return true
    }
    // A stale save is not a failure to retry: the reviewer chooses (the conflict banner). Anything else stays on the device.
    if (result.conflict) { setConflict(true); setUnsent(false) } else { setUnsent(true); setError(result.error) }
    return false
  }

  const handleSave = () => { void send(revisionRef.current, { notes, agreedActions: actions }) }

  // When the connection comes back, send the unsent text again (the latest text, read from a ref so it is never stale).
  useEffect(() => {
    if (!unsent) return
    const retry = () => { void send(revisionRef.current, latestRef.current) }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
    // send closes over the current props/state; the refs carry everything that must be fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsent])

  /** "Replace the saved review with my version": lock BEFORE the peek, fetch the current revision only after the user confirmed. */
  async function handleReplace() {
    setModal(null)
    if (sendingRef.current) return
    sendingRef.current = true
    setSaving(true)
    const latest = await onPeekRevision()
    sendingRef.current = false
    setSaving(false)
    if (latest === null) return // could not check the latest version: send nothing, keep the draft
    await send(latest, latestRef.current)
  }

  async function doShare() {
    setModal(null)
    if (sendingRef.current) return
    sendingRef.current = true
    setSaving(true)
    const result = await onShare(revisionRef.current)
    sendingRef.current = false
    setSaving(false)
    if (result.ok) { revisionRef.current = result.revision; setUnshareConfirmed(false) } // a later edit of the shared review must ask again
    else if (result.conflict) setConflict(true)
    else setError(result.error)
  }

  const handleShare = () => { if (isMonthFinished(period, todayDate)) void doShare(); else setModal('early') }

  async function doReopen() {
    if (!review || sendingRef.current) return // a reopen (or save) is already in flight
    sendingRef.current = true
    setSaving(true)
    const result = await onReopen(review.id, reopenReason.trim())
    sendingRef.current = false
    setSaving(false)
    if (result.ok) { revisionRef.current = result.revision; setReopenError(null); setModal(null); setReopenReason('') } else setReopenError(result.error)
  }

  const changeCount = view.changes.length
  const openReopen = () => { setReopenError(null); setModal('reopen') }
  const closeReopen = () => { setReopenError(null); setModal(null) }

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{tlName} · {monthName(period)}</h2>
            {review && <p className={mutedTextCls}>Created by {review.createdByName} · last edited by {review.lastEditedByName}{review.sharedByName ? ` · shared by ${review.sharedByName}` : ''}</p>}
          </div>
          <div className="flex items-center gap-2">
            {view.seenByTeamLeader && <span className={`${badgeCls} bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400`}>Seen by team leader</span>}
            <span className={`${badgeCls} ${STATUS_CLS[status]}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
          </div>
        </div>
        {status === 'acknowledged' && (
          <p className={`${mutedTextCls} mt-3`}>Acknowledged — the team leader confirmed they have read this, not that they agree.</p>
        )}
        <p className={`${mutedTextCls} mt-1`}>The planner summary comes with planner tracking.</p>
      </div>

      {view.previousComment && (
        <div className={`${cardCls} p-5 space-y-1`}>
          <p className={labelCls}>{view.previousComment.actorName}&apos;s previous comment · {formatAsAt(view.previousComment.at)}</p>
          <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{view.previousComment.note}</p>
        </div>
      )}

      {conflict && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 space-y-2" role="alert">
          <p className="text-sm text-red-800 dark:text-red-200">
            Your changes were not saved: newer changes were saved elsewhere since you opened this review. Nothing has been overwritten, and what you typed is kept on this device.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onReload} className={btnOutline}>Reload latest</button>
            <button type="button" onClick={() => setModal('replace')} className={btnOutline}>Replace the saved review with my version…</button>
          </div>
        </div>
      )}

      <ActivityDraftNotice
        restored={!!drafts.restored && !saved}
        unsent={unsent}
        retrying={saving}
        onRetry={handleSave}
        pending={!!drafts.pending}
        onUsePending={() => { if (drafts.pending) { edit(drafts.pending); drafts.acceptPending(drafts.pending) } }}
        onDiscardPending={drafts.discard}
      />

      {changeCount > 0 && status !== 'draft' && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-2" role="status">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {changeCount} {changeCount === 1 ? 'figure has' : 'figures have'} changed since you shared this — {status === 'acknowledged' ? 'ask the HOD to reopen this review to update it.' : 're-share to update.'}
          </p>
          <table className="text-sm">
            <thead><tr><th className="pr-6 text-left">Figure</th><th className="pr-6 text-left">As shared</th><th className="text-left">Now</th></tr></thead>
            <tbody>
              {view.changes.map((c) => (
                <tr key={c.label}><td className="pr-6">{c.label}</td><td className="pr-6">{c.before}</td><td>{c.after}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={`${cardCls} p-5 space-y-4`}>
        <h3 className={sectionTitleCls}>Notes &amp; agreed actions</h3>
        <div>
          <label className={labelCls} htmlFor="review-notes">Notes</label>
          <textarea id="review-notes" rows={6} readOnly={lockedByStatus} disabled={fieldsDisabled} value={notes}
            onChange={(e) => edit({ notes: e.target.value, agreedActions: actions })} className={`${inputCls} resize-y`} />
          <Counter used={notes.length} max={MAX_REVIEW_NOTES} />
        </div>
        <div>
          <label className={labelCls} htmlFor="review-actions">Agreed actions</label>
          <textarea id="review-actions" rows={4} readOnly={lockedByStatus} disabled={fieldsDisabled} value={actions}
            onChange={(e) => edit({ notes, agreedActions: e.target.value })} className={`${inputCls} resize-y`} />
          <Counter used={actions.length} max={MAX_REVIEW_ACTIONS} />
        </div>
        {error && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {dirty && <span className={mutedTextCls}>Unsaved changes</span>}
          {saved && !dirty && <span className="text-sm text-green-700 dark:text-green-400">Saved</span>}
          {status === 'shared' && !unshareConfirmed && (
            <button type="button" onClick={() => setModal('edit')} className={btnOutline}>Edit review</button>
          )}
          {isHod && status === 'acknowledged' && (
            <button type="button" onClick={openReopen} className={btnOutline}>Reopen</button>
          )}
          {status !== 'acknowledged' && (
            <>
              <button type="button" onClick={handleSave} disabled={saving || (!dirty && !(status === 'shared' && unshareConfirmed)) || overLimit || lockedByStatus || !!drafts.pending} className={btnOutline}>Save</button>
              <button type="button" onClick={handleShare} disabled={saving || dirty || !review || status !== 'draft' || overLimit} className={btnPrimary}>Share with team leader</button>
            </>
          )}
        </div>
      </div>

      <ReviewSnapshotView snapshot={view.live} heading="Live figures" />
      {status !== 'draft' && shareEvent?.snapshot && <ReviewSnapshotView snapshot={shareEvent.snapshot} heading="As shared" />}

      <div className={`${cardCls} p-5 space-y-2`}>
        <h3 className={sectionTitleCls}>History</h3>
        <ul className="space-y-2">
          {view.events.map((e) => (
            <li key={e.id} className="text-sm text-gray-700 dark:text-gray-300">
              {e.toStatus === 'shared' ? 'Shared' : e.toStatus === 'acknowledged' ? 'Acknowledged' : e.fromStatus === null ? 'Created' : e.fromStatus === 'shared' ? 'Unshared' : 'Reopened'} by {e.actorName} · {formatAsAt(e.at)}
              {e.reason && <span className={mutedTextCls}> — {e.reason}</span>}
              {e.note && <span className={mutedTextCls}> — comment: {e.note}</span>}
              {e.notesCopy !== null && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-blue-600 dark:text-blue-400">What was shared</summary>
                  <p className="text-sm whitespace-pre-wrap mt-1">{e.notesCopy}</p>
                  <p className="text-sm whitespace-pre-wrap mt-1">{e.actionsCopy}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      </div>

      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Edit this shared review?">
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">Editing will unshare this review until you share it again.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(null)} className={btnSecondary}>Cancel</button>
            <button type="button" onClick={() => { setUnshareConfirmed(true); setModal(null) }} className={btnPrimary}>Edit and unshare</button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'early'} onClose={() => setModal(null)} title="Share before the month has finished?">
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">{monthName(period)} isn&apos;t finished — figures may still change before you share.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(null)} className={btnSecondary}>Cancel</button>
            <button type="button" onClick={() => void doShare()} className={btnPrimary}>Share anyway</button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'replace'} onClose={() => setModal(null)} title="Replace the saved review?">
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Replacing the review will overwrite the changes that were saved since you opened it. This cannot be undone from the app.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(null)} className={btnSecondary}>Cancel</button>
            <button type="button" onClick={() => void handleReplace()} className={btnPrimary}>Replace review</button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'reopen'} onClose={closeReopen} title="Reopen this review">
        <div className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="reopen-reason">Reason (required)</label>
            <textarea id="reopen-reason" rows={3} value={reopenReason} onChange={(e) => { setReopenReason(e.target.value); setReopenError(null) }} className={`${inputCls} resize-none`} />
            <Counter used={reopenReason.length} max={MAX_REVIEW_REASON} />
          </div>
          {reopenError && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{reopenError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeReopen} className={btnSecondary}>Cancel</button>
            <button type="button" onClick={() => void doReopen()} disabled={reopenReason.trim() === '' || reopenReason.length > MAX_REVIEW_REASON} className={btnPrimary}>Reopen review</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
