// The limits on Daily/Weekly Activity numbers and notes. One place, used by both the
// server actions (lib/leadops/activityActions.ts, which is what actually enforces them)
// and the screens (so a bad value is caught and highlighted before it is sent). They
// mirror the CHECK constraints in Database/migrations/leadops-activity-logs-2026-10-09.sql.
// Pure: safe to import from client components.

export const MAX_COUNT = 10000
export const MAX_NOTES = 2000

export type ParsedCount = { ok: true; value: number } | { ok: false }

/**
 * A count typed into a form field: an empty field means 0, otherwise it must be a whole
 * number from 0 to MAX_COUNT. A number input will still hold "1.5", "-1" or "1e5", which
 * the server (and the database) refuse — so those are rejected here too.
 */
export function parseCount(raw: string): ParsedCount {
  const text = raw.trim()
  if (text === '') return { ok: true, value: 0 }
  if (!/^\d+$/.test(text)) return { ok: false }
  const value = Number(text)
  return value <= MAX_COUNT ? { ok: true, value } : { ok: false }
}
