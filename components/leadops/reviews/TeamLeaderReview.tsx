'use client'

import { useEffect, useRef, useState } from 'react'
import { cardCls, mutedTextCls, sectionTitleCls } from '@/components/reports/theme'
import { MAX_REVIEW_COMMENT, REVIEW_MESSAGES, monthName } from '@/lib/leadops/reviewLimits'
import type { TeamLeaderReviewView } from '@/lib/leadops/reviewActions'
import ReviewSnapshotView, { formatAsAt } from './ReviewSnapshotView'
import type { ReviewActionResult } from './useReview'
import { badgeCls, btnOutline, btnPrimary, inputCls, labelCls } from '../statusStyles'

interface Props {
  view: TeamLeaderReviewView
  period: string
  onAcknowledge: (reviewId: string, shareEventId: string, note: string | null) => Promise<ReviewActionResult<{ revision: number }>>
  onViewed: (reviewId: string, shareEventId: string) => void
  onReload: () => void
}

/**
 * The team leader's view: ONLY the frozen share — never draft text, never anything of anyone else's. The screen tells the
 * server which share it showed (`onViewed`, once per share) and acknowledges that exact share, so an acknowledgement can
 * never land on text the team leader has not read.
 */
export default function TeamLeaderReview({ view, period, onAcknowledge, onViewed, onReload }: Props) {
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const markedRef = useRef<string | null>(null)

  const shareEventId = view.shared?.shareEventId ?? null
  const reviewId = view.reviewId
  // Mark each share as opened once — from THIS screen only (a reviewer's preview never mounts this component).
  useEffect(() => {
    if (reviewId && shareEventId && markedRef.current !== shareEventId) {
      markedRef.current = shareEventId
      onViewed(reviewId, shareEventId)
    }
  }, [reviewId, shareEventId, onViewed])

  if (view.state === 'none') {
    return <div className={`${cardCls} p-8 text-center`}><p className={mutedTextCls}>No review shared for {monthName(period)} yet.</p></div>
  }
  if (view.state === 'being_revised' || !view.shared || !reviewId) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <p className={mutedTextCls}>This review is being revised. You will be told when it is shared again.</p>
      </div>
    )
  }

  const shared = view.shared
  const acknowledged = view.state === 'acknowledged'
  const ackEvent = [...view.events].reverse().find((e) => e.toStatus === 'acknowledged')
  const tooLong = comment.length > MAX_REVIEW_COMMENT
  // Only when the share changed under the reader does reading the new version help; a network failure is just retried.
  const versionProblem = error === REVIEW_MESSAGES.staleShare || error === REVIEW_MESSAGES.notShared || error === REVIEW_MESSAGES.illegalTransition

  async function acknowledge() {
    if (sending || tooLong) return
    setSending(true)
    setError(null)
    const result = await onAcknowledge(reviewId!, shared.shareEventId, comment.trim() === '' ? null : comment.trim())
    setSending(false)
    if (!result.ok) setError(result.error)
  }

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{shared.snapshot.teamLeaderName} · {monthName(period)}</h2>
            <p className={mutedTextCls}>Reviewed by {shared.reviewedBy}</p>
            <p className={mutedTextCls}>Shared {formatAsAt(shared.sharedAt)}</p>
          </div>
          <span className={`${badgeCls} ${acknowledged ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'}`}>
            {acknowledged ? 'Acknowledged' : 'Shared'}
          </span>
        </div>
      </div>

      <ReviewSnapshotView snapshot={shared.snapshot} />

      <div className={`${cardCls} p-5 space-y-4`}>
        <h3 className={sectionTitleCls}>Notes &amp; agreed actions</h3>
        <div>
          <p className={labelCls}>Notes</p>
          <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{shared.notes}</p>
        </div>
        <div>
          <p className={labelCls}>Agreed actions</p>
          <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{shared.agreedActions}</p>
        </div>
      </div>

      {acknowledged ? (
        <div className={`${cardCls} p-5 space-y-2`}>
          <p className="text-sm text-green-700 dark:text-green-400">Acknowledged {ackEvent ? formatAsAt(ackEvent.at) : ''}</p>
          {ackEvent?.note && (
            <div data-testid="own-comment">
              <p className={labelCls}>Your comment</p>
              <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{ackEvent.note}</p>
            </div>
          )}
        </div>
      ) : (
        <div className={`${cardCls} p-5 space-y-3`}>
          <div>
            <label className={labelCls} htmlFor="review-comment">Your comment (optional)</label>
            <textarea id="review-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={`${inputCls} resize-none`} />
            <p className={`text-xs mt-1 ${tooLong ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{comment.length}/{MAX_REVIEW_COMMENT}</p>
          </div>
          <p className={mutedTextCls}>Acknowledge: confirms you&apos;ve read this review, not that you agree with it.</p>
          {error && (
            <div className="space-y-2" role="alert">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              {versionProblem && <button type="button" onClick={onReload} className={btnOutline}>Read the new version</button>}
            </div>
          )}
          <button type="button" onClick={acknowledge} disabled={sending || tooLong} className={btnPrimary}>Acknowledge</button>
        </div>
      )}

      <div className={`${cardCls} p-5 space-y-2`}>
        <h3 className={sectionTitleCls}>History</h3>
        <ul className="space-y-1">
          {view.events.map((e) => (
            <li key={e.id} className="text-sm text-gray-700 dark:text-gray-300">
              {e.toStatus === 'shared' ? 'Shared' : e.toStatus === 'acknowledged' ? 'Acknowledged' : 'Returned to draft'} by {e.actorName} · {formatAsAt(e.at)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
