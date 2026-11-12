import type { Notification } from '@/types'

/** Notification types important and time-sensitive enough to interrupt the agent with a centred pop-up: callbacks, reminders, escalations and follow-ups. */
const POPUP_TYPES: readonly string[] = ['callback', 'reminder', 'escalation', 'followup']

export function isPopupType(type: string): boolean {
  return POPUP_TYPES.includes(type)
}

/**
 * Decides which polled notifications should pop up.
 *
 * `seen` is every notification id already accounted for. It is `null` before
 * the first poll: that poll only records what is already there, so signing in
 * does not fire a pop-up for every old unread item. After that, a notification
 * pops up once — when its id first appears, if it is unread and a popup type —
 * oldest first so a burst is read in the order it happened. Returns a new
 * `seen` set rather than mutating the one passed in.
 */
export function selectNewPopups(
  seen: Set<string> | null,
  current: Notification[],
): { popups: Notification[]; seen: Set<string> } {
  const nextSeen = new Set(seen ?? [])
  const fresh = seen === null ? [] : current.filter((n) => !seen.has(n.id))
  for (const n of current) nextSeen.add(n.id)

  const popups = fresh
    .filter((n) => !n.read && isPopupType(n.type))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  return { popups, seen: nextSeen }
}
