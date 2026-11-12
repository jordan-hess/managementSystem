// Per-browser "last seen" tracking for the red unread dots (announcements,
// notification bell). Deliberately localStorage only for now — it is a
// per-viewer convenience, not synced across devices. A DB-backed per-user
// last_seen is the planned follow-up. Every access is wrapped in try/catch
// because storage can be blocked (private window, cleared site data); the
// dots then just behave as "everything unseen".

const PREFIX = 'opshub:lastSeen'

function storageKey(scope: string, userId: string) {
  return `${PREFIX}:${scope}:${userId}`
}

// Only populated when a write to localStorage fails, so that within one page
// session the dot still clears even though nothing could be persisted.
const memoryFallback = new Map<string, number>()

/** Epoch ms of the newest item the user has seen, or null if never/unavailable. */
export function getLastSeen(scope: string, userId: string): number | null {
  const key = storageKey(scope, userId)
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      const value = Number(raw)
      if (Number.isFinite(value)) return value
    }
  } catch {
    // fall through to the in-memory value
  }
  return memoryFallback.get(key) ?? null
}

export function setLastSeen(scope: string, userId: string, ms: number): void {
  const key = storageKey(scope, userId)
  try {
    localStorage.setItem(key, String(ms))
  } catch {
    memoryFallback.set(key, ms)
  }
}

/** Epoch ms of the newest created_at in the list, or null if empty. */
export function newestTimestamp(items: { created_at: string }[]): number | null {
  let newest: number | null = null
  for (const item of items) {
    const ms = Date.parse(item.created_at)
    if (Number.isFinite(ms) && (newest === null || ms > newest)) newest = ms
  }
  return newest
}

/** How many items are newer than lastSeen (all of them if lastSeen is null). */
export function countUnseen(items: { created_at: string }[], lastSeen: number | null): number {
  if (lastSeen === null) return items.length
  return items.filter(item => Date.parse(item.created_at) > lastSeen).length
}
