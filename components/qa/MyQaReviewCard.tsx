'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Loader2, MessageSquarePlus } from 'lucide-react'
import type { MyQaReviewRow } from '@/lib/qa/reviewPageData'
import { DEPARTMENT_LABELS, LEGS_LABELS } from '@/lib/qa/constants'
import ReviewOutcomeSummary from './ReviewOutcomeSummary'
import { submitAgentFeedbackAction } from '@/app/(app)/qa/actions'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const AVATAR_PALETTE = [
  'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500',
  'bg-teal-500', 'bg-indigo-500', 'bg-rose-500', 'bg-cyan-500',
]

/** Deterministic per-reviewer avatar color — same reviewer always renders the
 *  same color, without needing to store one. */
function avatarColorFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

export default function MyQaReviewCard({ review }: { review: MyQaReviewRow }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(review.agent_feedback ?? '')
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, clearFieldError, clearAll, applyActionError } = useFormErrors<'feedback'>(['feedback'])

  const scopeLabel = `${DEPARTMENT_LABELS[review.department] ?? review.department} · ${LEGS_LABELS[review.legs] ?? review.legs}`
  const initial = review.reviewer_full_name.charAt(0).toUpperCase()

  async function handleSave() {
    setSaving(true)
    clearAll()
    const result = await submitAgentFeedbackAction(review.id, draft)
    setSaving(false)
    // The card's only input is the feedback box, so a failed save belongs to it.
    if (result.error) { applyActionError({ error: result.error, field: 'feedback' }); return }
    setEditing(false)
    router.refresh()
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold text-white ${avatarColorFor(review.reviewer_id ?? '')}`}>
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">Reviewed by {review.reviewer_full_name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {scopeLabel}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400 dark:text-gray-500">{format(new Date(review.interaction_date + 'T00:00:00'), 'd MMM')}</span>
        <Link href={`/qa-reviews/${review.id}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">View review</Link>
      </div>

      <ReviewOutcomeSummary
        compact
        outcome={review.outcome}
        rating={review.rating_label}
        finalScore={review.final_score}
        rootCauses={review.rootCauses}
        legacyRootCause={review.legacyRootCause}
      />

      {editing ? (
        <div className="space-y-1.5 pt-1">
          <textarea
            id={`qa-feedback-${review.id}`}
            rows={2}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); clearFieldError('feedback') }}
            placeholder="Optional feedback about this review..."
            className={fieldInputClass('w-full text-xs px-2.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none', !!fieldErrors.feedback)}
            {...fieldA11y(`qa-feedback-${review.id}`, fieldErrors.feedback)}
          />
          <FieldError id={`qa-feedback-${review.id}`} message={fieldErrors.feedback} />
          <FormErrorBanner message={formError} />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(review.agent_feedback ?? ''); clearAll() }}
              className="text-xs font-medium px-2 py-1 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Save
            </button>
          </div>
        </div>
      ) : review.agent_feedback ? (
        <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-600 dark:text-gray-400 italic">&ldquo;{review.agent_feedback}&rdquo;</p>
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1">
            Edit feedback
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" /> Add feedback
        </button>
      )}
    </div>
  )
}
