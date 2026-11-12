import type { RatingLabel } from '@/lib/qa/scorecard'
import type { ReviewOutcome } from '@/lib/qa/reviewOutcome'
import { outcomeBadgeCls } from '@/lib/qa/constants'

export interface AgentRootCause {
  name: string
  notes: string | null
}

interface Props {
  outcome: ReviewOutcome
  rating: RatingLabel
  finalScore: number | null
  rootCauses: AgentRootCause[]
  /** The old single Root Cause dropdown, on reviews saved before it was removed. */
  legacyRootCause?: string | null
  /** Card size (My QA board) vs. full page (the agent's review view). */
  compact?: boolean
}

/** What an agent sees of a review: the result, a short why, and the root cause(s). */
export default function ReviewOutcomeSummary({ outcome, rating, finalScore, rootCauses, legacyRootCause, compact }: Props) {
  const text = compact ? 'text-xs' : 'text-sm'
  const heading = `${compact ? 'text-xs' : 'text-sm'} font-semibold text-gray-900 dark:text-white`
  const causes: AgentRootCause[] = [
    ...rootCauses,
    ...(legacyRootCause && !rootCauses.some((c) => c.name === legacyRootCause) ? [{ name: legacyRootCause, notes: null }] : []),
  ]

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="review-result"
          className={`${compact ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'} font-semibold rounded-full ${outcomeBadgeCls(rating)}`}
        >
          {outcome.result}{finalScore === null ? '' : ` · ${finalScore}%`}
        </span>
        {rating && rating !== 'Fail' && <span className={`${text} text-gray-500 dark:text-gray-400`}>{rating}</span>}
      </div>

      <div className="space-y-1">
        {!compact && <p className={heading}>{outcome.result === 'Fail' ? 'Why it failed' : 'Why it passed'}</p>}
        <p className={`${text} text-gray-700 dark:text-gray-300`}>{outcome.headline}</p>
        {outcome.reasons.length > 0 && (
          <>
            {outcome.result === 'Pass' && <p className={`${text} text-gray-500 dark:text-gray-400`}>Still worth working on:</p>}
            <ul className={`${text} list-disc list-inside space-y-0.5 text-gray-700 dark:text-gray-300`}>
              {outcome.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </>
        )}
      </div>

      <div className="space-y-1">
        <p className={heading}>Root cause{causes.length === 1 ? '' : 's'}</p>
        {causes.length === 0 ? (
          <p className={`${text} text-gray-500 dark:text-gray-400`}>None recorded.</p>
        ) : (
          <ul className={`${text} space-y-1 text-gray-700 dark:text-gray-300`} data-testid="root-causes">
            {causes.map((c) => (
              <li key={c.name}>
                <span className="font-medium">{c.name}</span>
                {c.notes && <span className="text-gray-500 dark:text-gray-400"> — {c.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
