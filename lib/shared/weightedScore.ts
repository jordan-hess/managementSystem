/**
 * Generic weighted-sum scoring with N/A proportional reweighting — pure, no
 * I/O. Extracted from QA's former weighted-scoring module,
 * which already implemented exactly this math but only for QA's 0-5 rating
 * scale. This version takes a pre-resolved `scorePct` per item (0..1) so any
 * domain can feed it a percentage however that domain derives one — QA's
 * `rating / 5`, leadOps Manager Scorecard's roll-up/rated-KPA percentages,
 * or anything else that needs "weighted average, excluding N/A items from
 * both the numerator and the denominator" rather than scoring them as 0.
 *
 * A null `scorePct` means EXCLUDED (N/A, not yet rated, no data) — never use
 * 0 for that; 0 is a real, counted score that still occupies its full
 * weight in the denominator.
 */

export interface WeightedItemInput {
  id: string
  weight: number
  /** 0..1, or null to exclude this item from both numerator and denominator. */
  scorePct: number | null
}

export interface WeightedItemResult extends WeightedItemInput {
  /** scorePct * weight, in weight units. 0 when excluded. */
  contribution: number
}

export interface ScoreWeightedResult {
  totalWeightApplicable: number
  totalWeightExcluded: number
  weightedSum: number
  /** weightedSum / totalWeightApplicable * 100, rounded to 2dp. Null — not 0 — when nothing is applicable; callers decide how to render "no data". */
  pct: number | null
  perItem: WeightedItemResult[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function scoreWeighted(items: WeightedItemInput[]): ScoreWeightedResult {
  const perItem: WeightedItemResult[] = items.map((item) => ({
    ...item,
    contribution: item.scorePct === null ? 0 : round2(item.scorePct * item.weight),
  }))

  const totalWeightExcluded = round2(perItem.filter((i) => i.scorePct === null).reduce((sum, i) => sum + i.weight, 0))
  const totalWeightApplicable = round2(perItem.filter((i) => i.scorePct !== null).reduce((sum, i) => sum + i.weight, 0))
  const weightedSum = round2(perItem.reduce((sum, i) => sum + i.contribution, 0))
  const pct = totalWeightApplicable > 0 ? round2((weightedSum / totalWeightApplicable) * 100) : null

  return { totalWeightApplicable, totalWeightExcluded, weightedSum, pct, perItem }
}
