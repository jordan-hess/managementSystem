'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { getLastSeen, setLastSeen } from './lastSeen'

const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  // Also follow changes made in another tab.
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

/**
 * Reads the per-browser "last seen" timestamp for a scope.
 * `lastSeen` is `undefined` on the server and until the browser has hydrated
 * (localStorage does not exist during SSR) — callers should show no dot then,
 * to avoid a red flash on every page load. `markSeen` persists and re-renders.
 */
export function useLastSeen(scope: string, userId: string) {
  const lastSeen = useSyncExternalStore<number | null | undefined>(
    subscribe,
    () => getLastSeen(scope, userId),
    () => undefined,
  )

  const markSeen = useCallback((ms: number) => {
    setLastSeen(scope, userId, ms)
    listeners.forEach(notify => notify())
  }, [scope, userId])

  return { lastSeen, markSeen }
}
