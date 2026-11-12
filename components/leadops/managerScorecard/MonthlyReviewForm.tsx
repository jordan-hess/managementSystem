'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cardCls, mutedTextCls, sectionTitleCls } from '@/components/reports/theme'
import { MANAGER_KPAS } from '@/lib/leadops/constants'
import type { ManagerKpaRating, RatingValue } from '@/lib/leadops/types'
import { RATING_LABELS, btnPrimary, inputCls, labelCls } from '../statusStyles'

interface Props {
  month: string
  managerId: string
  ratings: ManagerKpaRating[]
  canEnterSelf: boolean
  canReview: boolean
  onSave: (rating: ManagerKpaRating) => void
}

const RATED_KPAS = MANAGER_KPAS.filter((k) => k.method === 'rated').sort((a, b) => a.rank - b.rank)
const RATING_OPTIONS: RatingValue[] = [3, 2, 1, 'NA']

/**
 * The 5 Rated KPAs only — Roll-Up KPAs are computed, never rated. Each KPA
 * pairs self-assessment (left) with reviewer feedback (right) side by side
 * at full width (lg:), stacking on narrower screens. The reviewer feedback
 * column stays genuinely blank, not an empty "Reviewer" column, until the
 * reviewer has actually entered something — in which case self-assessment
 * takes the full row alone rather than sitting beside empty space — UNLESS
 * the current viewer IS the reviewer: they still need the (unchanged)
 * editable controls to enter that first rating. An explicit reviewer N/A
 * wins over any self rating, including a self 3 — the source spec's own
 * precedence rule, implemented fresh here since nothing on the TL side had
 * this dual self/reviewer-N/A shape to begin with.
 */
export default function MonthlyReviewForm({ month, managerId, ratings, canEnterSelf, canReview, onSave }: Props) {
  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className={sectionTitleCls}>Monthly review — {month}</h2>
        <p className={mutedTextCls}>The 5 Rated KPAs. Self-rating is the manager&apos;s own; reviewer fields are filled in live during the review.</p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {RATED_KPAS.map((kpa) => {
          const rating = ratings.find((r) => r.kpa_key === kpa.key)
          return (
            <RatedKpaRow
              key={kpa.key}
              kpaKey={kpa.key}
              kpaName={kpa.name}
              month={month}
              managerId={managerId}
              rating={rating}
              canEnterSelf={canEnterSelf}
              canReview={canReview}
              onSave={onSave}
            />
          )
        })}
      </div>
    </div>
  )
}

function RatedKpaRow({
  kpaKey, kpaName, month, managerId, rating, canEnterSelf, canReview, onSave,
}: {
  kpaKey: string
  kpaName: string
  month: string
  managerId: string
  rating: ManagerKpaRating | undefined
  canEnterSelf: boolean
  canReview: boolean
  onSave: (rating: ManagerKpaRating) => void
}) {
  const [selfRating, setSelfRating] = useState<RatingValue | null>(rating?.self_rating ?? null)
  const [selfEvidence, setSelfEvidence] = useState(rating?.self_evidence ?? '')
  const [reviewerRating, setReviewerRating] = useState<RatingValue | null>(rating?.reviewer_rating ?? null)
  const [reviewerComments, setReviewerComments] = useState(rating?.reviewer_comments ?? '')
  const [agreedAction, setAgreedAction] = useState(rating?.agreed_action ?? '')
  const [saved, setSaved] = useState(false)

  function buildRow(): ManagerKpaRating {
    return {
      manager_id: managerId,
      month,
      kpa_key: kpaKey,
      self_rating: selfRating,
      self_evidence: selfEvidence.trim() || null,
      reviewer_rating: reviewerRating,
      reviewer_comments: reviewerComments.trim() || null,
      agreed_action: agreedAction.trim() || null,
      updated_at: '',
    }
  }

  function save() {
    onSave(buildRow())
    setSaved(true)
  }

  // Blank — not an empty-but-visible "Reviewer" section — until the
  // reviewer has actually said something, UNLESS this viewer IS the
  // reviewer: they still need the controls to enter that first rating.
  const hasReviewerFeedback = reviewerRating !== null || reviewerComments.trim() !== '' || agreedAction.trim() !== ''
  const showReviewerSection = canReview || hasReviewerFeedback

  return (
    <div className="p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{kpaName}</h3>

      <div className={showReviewerSection ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}>
        <div className="space-y-3">
          <p className={mutedTextCls}>Self-assessment</p>
          <RatingButtons value={selfRating} onChange={(v) => { setSelfRating(v); setSaved(false) }} disabled={!canEnterSelf} idPrefix={`${kpaKey}-self`} />
          <div>
            <label className={labelCls} htmlFor={`${kpaKey}-self-evidence`}>Evidence</label>
            <textarea
              id={`${kpaKey}-self-evidence`} rows={2} disabled={!canEnterSelf}
              value={selfEvidence} onChange={(e) => { setSelfEvidence(e.target.value); setSaved(false) }}
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>

        {showReviewerSection && (
          <div className="space-y-3 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-gray-100 dark:border-gray-800 lg:pl-6">
            <p className={mutedTextCls}>Reviewer feedback</p>
            <RatingButtons value={reviewerRating} onChange={(v) => { setReviewerRating(v); setSaved(false) }} disabled={!canReview} idPrefix={`${kpaKey}-reviewer`} />
            <div>
              <label className={labelCls} htmlFor={`${kpaKey}-reviewer-comments`}>Comments</label>
              <textarea
                id={`${kpaKey}-reviewer-comments`} rows={2} disabled={!canReview}
                value={reviewerComments} onChange={(e) => { setReviewerComments(e.target.value); setSaved(false) }}
                className={`${inputCls} resize-none`}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor={`${kpaKey}-agreed-action`}>Agreed action</label>
              <textarea
                id={`${kpaKey}-agreed-action`} rows={2} disabled={!canReview}
                value={agreedAction} onChange={(e) => { setAgreedAction(e.target.value); setSaved(false) }}
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>
        )}
      </div>

      {(canEnterSelf || canReview) && (
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
          <button type="button" onClick={save} className={btnPrimary}>Save</button>
        </div>
      )}
    </div>
  )
}

function RatingButtons({
  value, onChange, disabled, idPrefix,
}: { value: RatingValue | null; onChange: (v: RatingValue) => void; disabled: boolean; idPrefix: string }) {
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={`${idPrefix} rating`}>
      {RATING_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`text-left text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
            value === option
              ? option === 'NA'
                ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                : 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          {RATING_LABELS[option]}
        </button>
      ))}
    </div>
  )
}
