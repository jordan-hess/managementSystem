'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  acknowledgeReviewAction, fetchLeadOpsReviewAction, markReviewViewedAction, reopenReviewAction, saveReviewDraftAction, shareReviewAction,
  type ReviewerReviewView, type TeamLeaderReviewView,
} from '@/lib/leadops/reviewActions'
import { REVIEW_MESSAGES } from '@/lib/leadops/reviewLimits'

export type ReviewView = TeamLeaderReviewView | ReviewerReviewView
export type ReviewActionResult<T = object> = ({ ok: true } & T) | { ok: false; conflict: boolean; error: string }

const UNREACHABLE = 'The server could not be reached — reload the page and try again.'

interface Load {
  key: string
  view: ReviewView | null
  error: string | null
}

/**
 * One team leader's review for one month: loads it, and runs the actions. Lives beside the Performance Reviews tab
 * rather than in the shared provider so the live figures are only computed while the tab is open.
 *
 * `loading` is DERIVED (the loaded key differs from the requested one), and the effect's cleanup clears the stored
 * load, so a change of team leader or month — or reload() — always shows loading and never a stale view of a key we
 * had before. refresh() refetches WITHOUT clearing, so an editing screen keeps its local state.
 */
export function useReview(tlId: string, period: string, enabled: boolean) {
  const [load, setLoad] = useState<Load | null>(null)
  const [reloads, setReloads] = useState(0)
  const key = `${tlId}|${period}`
  const active = enabled && tlId !== ''
  const loading = active && load?.key !== key
  const current = load?.key === key ? load : null

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const loadKey = `${tlId}|${period}`
    fetchLeadOpsReviewAction(tlId, period)
      .then((result) => {
        if (cancelled) return
        setLoad(result.error !== undefined ? { key: loadKey, view: null, error: result.error } : { key: loadKey, view: result.data, error: null })
      })
      // A load that throws is an error state, never an empty review.
      .catch(() => { if (!cancelled) setLoad({ key: loadKey, view: null, error: REVIEW_MESSAGES.loadFailed }) })
    return () => { cancelled = true; setLoad(null) }
  }, [active, tlId, period, reloads])

  const reload = useCallback(() => setReloads((n) => n + 1), [])

  const refresh = useCallback(async () => {
    try {
      const result = await fetchLeadOpsReviewAction(tlId, period)
      if (result.error === undefined) {
        setLoad((prev) => (prev && prev.key === `${tlId}|${period}` ? { key: prev.key, view: result.data, error: null } : prev))
      }
    } catch {
      // best-effort: the screen still shows what it had
    }
  }, [tlId, period])

  const peekRevision = useCallback(async (): Promise<number | null> => {
    try {
      const result = await fetchLeadOpsReviewAction(tlId, period)
      if (result.error !== undefined || result.data.kind !== 'reviewer') return null
      return result.data.review?.revision ?? 0
    } catch {
      return null
    }
  }, [tlId, period])

  const run = useCallback(async <T extends object>(call: () => Promise<{ data: T; error?: undefined } | { data?: undefined; error: string }>): Promise<ReviewActionResult<T>> => {
    try {
      const result = await call()
      if (result.error !== undefined) return { ok: false, conflict: result.error === REVIEW_MESSAGES.conflict, error: result.error }
      void refresh()
      return { ok: true, ...result.data }
    } catch {
      return { ok: false, conflict: false, error: UNREACHABLE }
    }
  }, [refresh])

  const saveDraft = useCallback(
    (input: { expectedRevision: number; notes: string | null; agreedActions: string | null; confirmUnshare: boolean }) =>
      run(() => saveReviewDraftAction({ tlId, period, ...input })),
    [run, tlId, period],
  )
  const share = useCallback((expectedRevision: number) => run(() => shareReviewAction({ tlId, period, expectedRevision })), [run, tlId, period])
  const acknowledge = useCallback(
    (reviewId: string, shareEventId: string, note: string | null) => run(() => acknowledgeReviewAction({ reviewId, shareEventId, note })),
    [run],
  )
  const reopen = useCallback((reviewId: string, reason: string) => run(() => reopenReviewAction({ reviewId, reason })), [run])

  /** Fire-and-forget: the team leader's own screen records which share it showed. Never throws. */
  const markViewed = useCallback(async (reviewId: string, shareEventId: string): Promise<void> => {
    try {
      await markReviewViewedAction({ reviewId, shareEventId })
    } catch {
      // not worth surfacing: it only controls whether an unshare notification is sent
    }
  }, [])

  return {
    loading,
    error: current?.error ?? null,
    view: current?.view ?? null,
    reloadCount: reloads,
    reload, refresh, peekRevision, saveDraft, share, acknowledge, markViewed, reopen,
  }
}
