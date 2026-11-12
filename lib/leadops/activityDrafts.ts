// Device drafts for the Daily/Weekly Activity forms. What a team leader types is kept in
// THIS browser's localStorage so a dropped connection, a redeploy or a closed tab never
// costs them a day's figures (daily entries can only be changed on the day itself, so a
// lost entry cannot be re-entered tomorrow). It is a safety net, not a queue or a sync:
// clearing browser data or switching device loses the draft. Every access is wrapped in
// try/catch — if storage is blocked, full or corrupt there is simply no draft, and the
// forms work exactly as before. Pure and safe to import from client components.

const PREFIX = 'opshub:activityDraft:'
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export type DraftKind = 'daily' | 'weekly' | 'manager' | 'planner' | 'review'

export function draftKey(kind: DraftKind, ownerId: string, period: string): string {
  return `${PREFIX}${kind}:${ownerId}:${period}`
}

interface Stored {
  savedAt: number
  values: unknown
}

function isStored(value: unknown): value is Stored {
  return typeof value === 'object' && value !== null
    && typeof (value as Stored).savedAt === 'number' && 'values' in value
}

export function saveDraft<T>(key: string, values: T, now = Date.now()): void {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: now, values }))
  } catch {
    // storage blocked or full — no draft, the form still works
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // nothing to do
  }
}

/** The stored values, or null if there is no usable draft. Corrupt, wrongly shaped and expired drafts are removed. */
export function loadDraft<T>(key: string, now = Date.now()): T | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return null
  }
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearDraft(key)
    return null
  }
  if (!isStored(parsed) || now - parsed.savedAt > DRAFT_MAX_AGE_MS) {
    clearDraft(key)
    return null
  }
  return parsed.values as T
}

/** Every key under the draft prefix. Collected first, because removing while iterating shifts localStorage's indexes. */
function draftKeys(): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key !== null && key.startsWith(PREFIX)) keys.push(key)
    }
  } catch {
    return []
  }
  return keys
}

/** Drops expired and corrupt drafts (loading one removes it). Leaves every other localStorage key alone. */
export function pruneExpiredDrafts(now = Date.now()): void {
  for (const key of draftKeys()) loadDraft(key, now)
}

/** The days before `today` that still hold an unsent daily draft for this team leader, newest first. */
export function pastDailyDraftDates(ownerId: string, today: string, now = Date.now()): string[] {
  const prefix = `${PREFIX}daily:${ownerId}:`
  return draftKeys()
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({ key, date: key.slice(prefix.length) }))
    .filter(({ key, date }) => date < today && loadDraft(key, now) !== null)
    .map(({ date }) => date)
    .sort()
    .reverse()
}
