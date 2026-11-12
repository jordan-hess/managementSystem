'use client'

import { useCallback, useState } from 'react'
import { clearDraft, loadDraft, pruneExpiredDrafts, saveDraft } from '@/lib/leadops/activityDrafts'

const sameValues = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export interface ActivityDraft<T> {
  /** A stored draft to START the form from — only when no entry is saved for this day/week. */
  restored: T | null
  /** A stored draft that differs from the saved entry: offer Use / Discard, never pick silently. */
  pending: T | null
  /** Store the form's current values as the draft (call on every edit). */
  persist: (values: T) => void
  /** The server confirmed the save: the draft has done its job. */
  clear: () => void
  /** The user chose to discard the unsent draft. */
  discard: () => void
  /** The user chose "Use them": the form now holds `values`; store them and hide the offer. */
  acceptPending: (values: T) => void
}

/**
 * Device draft for one form (one day, or one week). `serverValues` is what the form would
 * show for the SAVED entry (null if none is saved) and is read once, at mount — callers
 * remount per day/week with a React `key`. When `enabled` is false (a viewer who cannot
 * edit) nothing is read, written or pruned.
 */
export function useActivityDraft<T>(key: string, enabled: boolean, serverValues: T | null): ActivityDraft<T> {
  const [stored] = useState<T | null>(() => {
    if (!enabled) return null
    pruneExpiredDrafts()
    const found = loadDraft<T>(key)
    // Identical to what is already saved: nothing to recover. Keep the stored draft though — the "saved" row may be
    // an unconfirmed optimistic one (offline), and only a confirmed save may delete a draft.
    if (found !== null && serverValues !== null && sameValues(found, serverValues)) return null
    return found
  })
  const [offerOpen, setOfferOpen] = useState(stored !== null && serverValues !== null)
  const [discarded, setDiscarded] = useState(false)

  const persist = useCallback((values: T) => { if (enabled) saveDraft(key, values) }, [enabled, key])
  const clear = useCallback(() => { if (enabled) clearDraft(key) }, [enabled, key])
  const discard = useCallback(() => { clearDraft(key); setOfferOpen(false); setDiscarded(true) }, [key])
  const acceptPending = useCallback((values: T) => { saveDraft(key, values); setOfferOpen(false) }, [key])

  return {
    restored: stored !== null && serverValues === null && !discarded ? stored : null,
    pending: stored !== null && serverValues !== null && offerOpen ? stored : null,
    persist,
    clear,
    discard,
    acceptPending,
  }
}
