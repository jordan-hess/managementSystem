'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchReviewRosterAction, type ReviewRosterEntry } from '@/lib/leadops/reviewActions'
import { REVIEW_MESSAGES } from '@/lib/leadops/reviewLimits'

interface Load {
  period: string
  people: ReviewRosterEntry[]
  error: string | null
}

/** The people a reviewer can pick for a month. Loading is derived from the month the loaded list belongs to, so a month change never shows the previous list. */
export function useReviewRoster(period: string, enabled: boolean): { loading: boolean; error: string | null; people: ReviewRosterEntry[]; reload: () => void } {
  const [load, setLoad] = useState<Load | null>(null)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchReviewRosterAction(period)
      .then((result) => {
        if (cancelled) return
        setLoad(result.error !== undefined ? { period, people: [], error: result.error } : { period, people: result.data, error: null })
      })
      .catch(() => { if (!cancelled) setLoad({ period, people: [], error: REVIEW_MESSAGES.loadFailed }) })
    return () => { cancelled = true; setLoad(null) }
  }, [enabled, period, reloads])

  const current = load?.period === period ? load : null
  const reload = useCallback(() => setReloads((n) => n + 1), [])
  return { loading: enabled && current === null, error: current?.error ?? null, people: current?.people ?? [], reload }
}
