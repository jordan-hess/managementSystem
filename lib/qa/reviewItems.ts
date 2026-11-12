/**
 * Stored review items -> scoring inputs. Pure (no lib/db import) so 'use
 * client' components (ReviewForm, CoachingActionsPanel) can use it;
 * lib/qa/reviewPageData.ts re-exports it for server callers.
 */
import type { QaReviewItem } from '@/types'
import { SCORECARD_ITEMS, fromDbLeg, type ItemInput } from './scorecard'

const ITEM_ORDER = new Map<string, number>(SCORECARD_ITEMS.map((d, idx) => [d.code, idx]))
export const byItemOrder = (a: { item_code: string }, b: { item_code: string }) =>
  (ITEM_ORDER.get(a.item_code) ?? 0) - (ITEM_ORDER.get(b.item_code) ?? 0)

/** Stored leg values -> scoring inputs, in SCORECARD_ITEMS order. */
export function reviewItemsToInputs(items: QaReviewItem[]): ItemInput[] {
  return [...items]
    .sort(byItemOrder)
    .map((i) => ({ code: i.item_code, written: fromDbLeg(i.item_code, i.written_value), call: fromDbLeg(i.item_code, i.call_value) }))
}
