import { SCORECARD_ITEMS, type ItemCode, type ItemInput, type RatingLabel } from './scorecard'

// The agent-facing summary of a review: pass/fail and a short "why", instead
// of the full scorecard. Pure, no I/O — used by the My QA card and the
// agent's view of /qa-reviews/[id].

export interface OutcomeSettings {
  passMark: number
  excellentFrom: number
  criticalFailCap: number
}

export interface ReviewOutcome {
  result: 'Pass' | 'Fail' | 'Not rated'
  /** One line: the score against the pass mark, or the critical failure. */
  headline: string
  /** Fail: what caused it. Pass: what is still worth working on. Short, worst first. */
  reasons: string[]
}

const MAX_REASONS = 4
const LABEL = new Map(SCORECARD_ITEMS.map((d) => [d.code, d.label]))

/**
 * `items` are the stored answers with the unused leg already forced to N/A
 * (applyLegs). `reasonTags` are the reason-tag types ticked on the review,
 * keyed to the critical item they explain.
 */
export function buildReviewOutcome(input: {
  rating: RatingLabel
  finalScore: number | null
  items: ItemInput[]
  reasonTags: { name: string; item_code: ItemCode }[]
  settings: OutcomeSettings | null
}): ReviewOutcome {
  const { rating, finalScore, items, reasonTags, settings } = input
  const byCode = new Map(items.map((i) => [i.code, i]))
  const score = finalScore === null ? null : `${finalScore}%`

  if (rating === '') return { result: 'Not rated', headline: 'This review has not been scored yet.', reasons: [] }

  if (rating === 'Fail (Critical)') {
    const failed = SCORECARD_ITEMS.filter((d) => d.section === 'critical')
      .filter((d) => { const i = byCode.get(d.code); return i?.written === 'no' || i?.call === 'no' })
      .map((d) => {
        const tags = reasonTags.filter((t) => t.item_code === d.code).map((t) => t.name)
        return tags.length ? `${d.label} (${tags.join(', ')})` : d.label
      })
    const cap = settings && score ? ` — score capped at ${settings.criticalFailCap}%` : ''
    return {
      result: 'Fail',
      headline: `Failed on a critical item${cap}.`,
      reasons: failed.length ? failed.map((f) => `Critical item missed: ${f}`) : ['A critical item was missed.'],
    }
  }

  const passed = rating === 'Good' || rating === 'Excellent'
  const mark = settings ? `${settings.passMark}%` : null
  const headline = score === null
    ? (passed ? 'Passed.' : 'Failed.')
    : passed
      ? `Scored ${score}${mark ? `, at or above the ${mark} pass mark` : ''}${rating === 'Excellent' ? ' — rated Excellent' : ''}.`
      : `Scored ${score}${mark ? `, below the ${mark} pass mark` : ''}.`

  return { result: passed ? 'Pass' : 'Fail', headline, reasons: missedItems(byCode).slice(0, MAX_REASONS) }
}

/** Lowest quality ratings first (scores of 2 or less), then must-do behaviours answered No. */
function missedItems(byCode: Map<ItemCode, ItemInput>): string[] {
  const low: { text: string; n: number }[] = []
  const missed: string[] = []
  for (const def of SCORECARD_ITEMS) {
    const item = byCode.get(def.code)
    if (!item) continue
    const vals = [item.written, item.call]
    if (def.section === 'quality') {
      const nums = vals.filter((v): v is 0 | 1 | 2 | 3 | 4 | 5 => typeof v === 'number')
      const worst = nums.length ? Math.min(...nums) : null
      if (worst !== null && worst <= 2) low.push({ text: `${LABEL.get(def.code)}: ${worst}/5`, n: worst })
    } else if (def.section === 'must_do' && vals.includes('no')) {
      missed.push(`Not done: ${LABEL.get(def.code)}`)
    }
  }
  return [...low.sort((a, b) => a.n - b.n).map((l) => l.text), ...missed]
}
