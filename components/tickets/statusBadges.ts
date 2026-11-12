import { ActiveAssistanceSource } from '@/types'

/**
 * One consolidated status -> badge-class lookup per source type, copied
 * verbatim from the four legacy managers' own maps (SupportTicketManager's
 * and FollowupManager's were byte-for-byte identical, deduped to one;
 * CallbackManager's and components/t2/Badges.tsx's kept as-is) — no new
 * colors invented for Phase 2.
 */
const SUPPORT_AND_FOLLOWUP_STATUS: Record<string, string> = {
  open: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  in_progress: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  resolved: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  closed: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  // support_ticket's status control only (followups' own status CHECK constraint
  // doesn't include these — harmless to share the map, just unused for that source).
  escalated: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
  follow_up: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400',
  callback: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
}

const CALLBACK_STATUS: Record<string, string> = {
  pending: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  completed: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  cancelled: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  rescheduled: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
}

const T2_TICKET_STATUS: Record<string, string> = {
  open: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  in_progress: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  escalated: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
  awaiting_t3: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
  t3_responded: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400',
  resolved: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  closed: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  callback: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
}

const STATUS_BADGES: Record<ActiveAssistanceSource, Record<string, string>> = {
  support_ticket: SUPPORT_AND_FOLLOWUP_STATUS,
  followup: SUPPORT_AND_FOLLOWUP_STATUS,
  callback: CALLBACK_STATUS,
  t2_ticket: T2_TICKET_STATUS,
}

const FALLBACK_BADGE = 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'

export function statusBadgeClass(sourceType: ActiveAssistanceSource, status: string): string {
  return STATUS_BADGES[sourceType][status] ?? FALLBACK_BADGE
}

/**
 * One shared 5-bucket status filter for every real "ticket" — Social
 * (support_ticket), T2 (t2_ticket, including Billing), and Follow-up —
 * replacing each source's own literal status list (T2 alone had 8: open/
 * in_progress/escalated/awaiting_t3/t3_responded/resolved/closed/callback).
 * A bucket groups sub-states that mean the same thing to an agent scanning
 * the list ("still escalated" whether it's awaiting T3 or already
 * responded) — the ticket's real status is untouched and still shown
 * correctly on its row badge; only the filter tab groups it.
 *
 * The standalone Callback *entity* (scheduled-callback records, their own
 * pending/completed/cancelled/rescheduled lifecycle) is a different domain
 * and keeps its own status vocabulary — it's never filtered through this.
 */
export const TICKET_STATUS_BUCKETS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'open', label: 'Open', statuses: ['open', 'in_progress'] },
  { key: 'callback', label: 'Callback', statuses: ['callback'] },
  { key: 'escalated', label: 'Escalated', statuses: ['escalated', 'awaiting_t3', 't3_responded'] },
  { key: 'follow_up', label: 'Follow-up', statuses: ['follow_up'] },
  { key: 'resolved', label: 'Resolved', statuses: ['resolved', 'closed'] },
]

/** Look up a bucket's underlying status list by its key — used server-side to turn a filter tab click into a `status IN (...)` match. */
export function ticketStatusBucketStatuses(key: string): string[] {
  return TICKET_STATUS_BUCKETS.find((b) => b.key === key)?.statuses ?? []
}
