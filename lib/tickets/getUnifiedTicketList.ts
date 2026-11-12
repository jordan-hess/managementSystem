import type { Fragment } from 'postgres'
import { sql } from '@/lib/db/pool'
import { QUEUES } from '@/lib/t2/constants'
import { AnyQueue } from '@/lib/queues/constants'
import { Role, TicketHistoryRecord } from '@/types'
import { ticketStatusBucketStatuses } from '@/components/tickets/statusBadges'

/**
 * The unified Tickets page's list query — genuinely server-side
 * paginated/filtered, not a client-fetch-everything-then-filter approach
 * like the three legacy managers (CustomerManager/SupportTicketManager/
 * TicketListManager) used.
 *
 * Two modes:
 *  - filters.queue === 'all': UNION ALL across all four ticket-like tables
 *    (same shape as lib/customers/getTicketHistory.ts, minus the
 *    customer-scoping, plus role/status/agent filters), normalized status
 *    groups, offset-paginated. followups/callbacks only ever appear here —
 *    they have no queue/channel concept of their own.
 *  - filters.queue is one specific queue/channel: query only that one
 *    table (tickets for a T2 queue, support_tickets for a Social channel) —
 *    cheaper, and lets nativeStatus filter that table's own status column
 *    directly instead of going through the statusGroup mapping.
 *
 * Role-based scoping is server-side and non-negotiable, not just a UI
 * toggle: plain agents are always scoped to their own tickets regardless of
 * the `mine` filter value — centralizes the ticketScope/followupScope/
 * callbackScope fragments previously duplicated per legacy page
 * (support-tickets/page.tsx) and the `scope` fragment duplicated in
 * t2/page.tsx and t2/sla-breaches/page.tsx. `mine`/`assignedAgentId` only
 * have effect for admin/management/team_leader — t3 keeps its existing
 * team-scoped view on T2 tickets (escalation_destination = own team) and,
 * same as before the merge, sees none of its own Social-side tickets
 * (t3 has never been assigned Social tickets, so this is a no-op there).
 */
export interface UnifiedTicketFilters {
  queue: AnyQueue | 'all'
  statusGroup: 'active' | 'resolved' | 'all'
  nativeStatus?: string
  mine: boolean
  assignedAgentId?: string
  /**
   * Inclusive "worked on" date range, as 'YYYY-MM-DD'. A ticket is in scope
   * if any work on it falls in the range — created, a status change / T2
   * event, or its last edit — so one raised on the 1st and resolved today
   * shows for both days. See the worked*() fragments below.
   */
  updatedFrom?: string
  updatedTo?: string
  page: number
  pageSize: number
}

interface Scope {
  userId: string
  role: Role
}

interface StatusGroupMap {
  supportTickets: string[]
  followups: string[]
  callbacks: string[]
  tickets: string[]
}

// 'closed' isn't a separate filter bucket — it's folded into 'resolved'
// (a closed ticket/followup is done, same as a resolved one; a cancelled
// callback is done in the same sense a completed one is).
const STATUS_GROUPS: Record<'active' | 'resolved', StatusGroupMap> = {
  active: {
    supportTickets: ['open', 'in_progress', 'escalated', 'follow_up', 'callback'],
    followups: ['open', 'in_progress'],
    callbacks: ['pending', 'rescheduled'],
    tickets: ['open', 'in_progress', 'escalated', 'awaiting_t3', 't3_responded', 'callback'],
  },
  resolved: {
    supportTickets: ['resolved', 'closed'],
    followups: ['resolved', 'closed'],
    callbacks: ['completed', 'cancelled'],
    tickets: ['resolved', 'closed'],
  },
}

const MAX_PAGE_SIZE = 100

/**
 * `column` falls inside the inclusive date range. `updatedTo` covers the
 * whole end day: a bare `<= '2026-09-23'` would mean 00:00 and drop that
 * day's work. ::date bounds resolve in the session time zone
 * (Africa/Johannesburg), so days start at local midnight.
 */
function inRange(filters: UnifiedTicketFilters, column: Fragment) {
  return sql`(
    ${filters.updatedFrom ? sql`${column} >= ${filters.updatedFrom}::date` : sql`TRUE`}
    AND ${filters.updatedTo ? sql`${column} < (${filters.updatedTo}::date + 1)` : sql`TRUE`}
  )`
}

const hasRange = (filters: UnifiedTicketFilters) => Boolean(filters.updatedFrom || filters.updatedTo)

// "Worked on in the range", per source: created, any status change / event,
// or the last edit (which also catches edits that don't change status).
// Callbacks keep no history, so only creation and last edit count there.
function workedSupportTicket(filters: UnifiedTicketFilters) {
  if (!hasRange(filters)) return sql``
  return sql`AND (
    ${inRange(filters, sql`st.created_at`)} OR ${inRange(filters, sql`st.updated_at`)}
    OR EXISTS (SELECT 1 FROM support_ticket_status_history sh WHERE sh.support_ticket_id = st.id AND ${inRange(filters, sql`sh.changed_at`)})
  )`
}

function workedFollowup(filters: UnifiedTicketFilters) {
  if (!hasRange(filters)) return sql``
  return sql`AND (
    ${inRange(filters, sql`f.created_at`)} OR ${inRange(filters, sql`f.updated_at`)}
    OR EXISTS (SELECT 1 FROM followup_status_history fh WHERE fh.followup_id = f.id AND ${inRange(filters, sql`fh.changed_at`)})
  )`
}

function workedCallback(filters: UnifiedTicketFilters) {
  if (!hasRange(filters)) return sql``
  return sql`AND (${inRange(filters, sql`cb.created_at`)} OR ${inRange(filters, sql`cb.updated_at`)})`
}

// tickets/ticket_events store text timestamps in UTC.
function workedT2Ticket(filters: UnifiedTicketFilters) {
  if (!hasRange(filters)) return sql``
  return sql`AND (
    ${inRange(filters, sql`(t.created_at::timestamp AT TIME ZONE 'UTC')`)}
    OR EXISTS (SELECT 1 FROM ticket_events ev WHERE ev.ticket_id = t.id AND ${inRange(filters, sql`(ev.created_at::timestamp AT TIME ZONE 'UTC')`)})
  )`
}

// A T2 ticket's "last updated" is its latest event, else its creation.
const t2UpdatedAt = () => sql`(COALESCE((SELECT MAX(te.created_at) FROM ticket_events te WHERE te.ticket_id = t.id), t.created_at)::timestamp AT TIME ZONE 'UTC')`

export async function getUnifiedTicketList(
  filters: UnifiedTicketFilters,
  scope: Scope,
): Promise<{ rows: TicketHistoryRecord[]; totalCount: number }> {
  const pageSize = Math.min(Math.max(filters.pageSize, 1), MAX_PAGE_SIZE)
  const offset = Math.max(filters.page, 0) * pageSize
  const bounded = { ...filters, pageSize }

  if (bounded.queue === 'all') return getAllQueuesList(bounded, scope, offset)
  if ((QUEUES as readonly string[]).includes(bounded.queue) || bounded.queue === 'BILLING') return getT2QueueList(bounded, scope, offset)
  return getSocialChannelList(bounded, scope, offset)
}

async function getT2QueueList(
  filters: UnifiedTicketFilters, { userId, role }: Scope, offset: number,
): Promise<{ rows: TicketHistoryRecord[]; totalCount: number }> {
  const scopeFragment =
    role === 'agent' ? sql`AND (t.created_by = ${userId} OR t.assigned_to = ${userId})` :
    role === 't3' ? sql`AND t.escalation_destination = (SELECT t2_team FROM profiles WHERE id = ${userId})` :
    filters.mine ? sql`AND (t.created_by = ${userId} OR t.assigned_to = ${userId})` :
    filters.assignedAgentId ? sql`AND t.assigned_to = ${filters.assignedAgentId}` :
    sql``

  const statusFragment = filters.nativeStatus
    ? sql`AND t.status = ANY(${ticketStatusBucketStatuses(filters.nativeStatus)})`
    : filters.statusGroup !== 'all'
      ? sql`AND t.status IN ${sql(STATUS_GROUPS[filters.statusGroup].tickets)}`
      : sql``
  const dateFragment = workedT2Ticket(filters)

  const [rows, countRows] = await Promise.all([
    sql<TicketHistoryRecord[]>`
      SELECT
        't2_ticket'::text AS "sourceType", t.id AS "sourceId", t.ticket_number AS "ticketLabel",
        t.queue AS "queueOrChannel", t.status, t.assigned_to AS "agentId", p.full_name AS "agentName",
        ${t2UpdatedAt()} AS "updatedAt",
        (t.created_at::timestamp AT TIME ZONE 'UTC') AS "createdAt",
        t.customer_id AS "customerId", cu.name AS "customerName",
        NULL::text AS "issueType", NULL::text AS "rootCause"
      FROM tickets t
      LEFT JOIN profiles p ON p.id = t.assigned_to
      LEFT JOIN customers cu ON cu.id = t.customer_id
      WHERE t.queue = ${filters.queue} ${scopeFragment} ${statusFragment} ${dateFragment}
      ORDER BY t.created_at DESC
      LIMIT ${filters.pageSize} OFFSET ${offset}
    `,
    sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM tickets t WHERE t.queue = ${filters.queue} ${scopeFragment} ${statusFragment} ${dateFragment}
    `,
  ])
  return { rows, totalCount: Number(countRows[0]?.count ?? 0) }
}

async function getSocialChannelList(
  filters: UnifiedTicketFilters, { userId, role }: Scope, offset: number,
): Promise<{ rows: TicketHistoryRecord[]; totalCount: number }> {
  const scopeFragment =
    role === 'agent' || role === 't3' ? sql`AND st.agent_id = ${userId}` :
    filters.mine ? sql`AND st.agent_id = ${userId}` :
    filters.assignedAgentId ? sql`AND st.agent_id = ${filters.assignedAgentId}` :
    sql``

  const statusFragment = filters.nativeStatus
    ? sql`AND st.status = ANY(${ticketStatusBucketStatuses(filters.nativeStatus)})`
    : filters.statusGroup !== 'all'
      ? sql`AND st.status IN ${sql(STATUS_GROUPS[filters.statusGroup].supportTickets)}`
      : sql``
  const dateFragment = workedSupportTicket(filters)

  const [rows, countRows] = await Promise.all([
    sql<TicketHistoryRecord[]>`
      SELECT
        'support_ticket'::text AS "sourceType", st.id AS "sourceId",
        COALESCE(st.reference, initcap(st.channel)) AS "ticketLabel",
        st.channel AS "queueOrChannel", st.status, st.agent_id AS "agentId", p.full_name AS "agentName",
        st.updated_at AS "updatedAt", st.created_at AS "createdAt",
        st.customer_id AS "customerId", cu.name AS "customerName",
        st.issue_type AS "issueType", st.root_cause AS "rootCause"
      FROM support_tickets st
      LEFT JOIN profiles p ON p.id = st.agent_id
      LEFT JOIN customers cu ON cu.id = st.customer_id
      WHERE st.channel = ${filters.queue} ${scopeFragment} ${statusFragment} ${dateFragment}
      ORDER BY st.created_at DESC
      LIMIT ${filters.pageSize} OFFSET ${offset}
    `,
    sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM support_tickets st WHERE st.channel = ${filters.queue} ${scopeFragment} ${statusFragment} ${dateFragment}
    `,
  ])
  return { rows, totalCount: Number(countRows[0]?.count ?? 0) }
}

async function getAllQueuesList(
  filters: UnifiedTicketFilters, { userId, role }: Scope, offset: number,
): Promise<{ rows: TicketHistoryRecord[]; totalCount: number }> {
  const privileged = role === 'admin' || role === 'management' || role === 'hod' || role === 'team_leader'

  const supportScope = !privileged ? sql`AND st.agent_id = ${userId}`
    : filters.mine ? sql`AND st.agent_id = ${userId}`
    : filters.assignedAgentId ? sql`AND st.agent_id = ${filters.assignedAgentId}`
    : sql``
  const followupScope = !privileged ? sql`AND f.agent_id = ${userId}`
    : filters.mine ? sql`AND f.agent_id = ${userId}`
    : filters.assignedAgentId ? sql`AND f.agent_id = ${filters.assignedAgentId}`
    : sql``
  const callbackScope = !privileged ? sql`AND cb.agent_id = ${userId}`
    : filters.mine ? sql`AND cb.agent_id = ${userId}`
    : filters.assignedAgentId ? sql`AND cb.agent_id = ${filters.assignedAgentId}`
    : sql``
  const ticketScope =
    role === 'agent' ? sql`AND (t.created_by = ${userId} OR t.assigned_to = ${userId})`
    : role === 't3' ? sql`AND t.escalation_destination = (SELECT t2_team FROM profiles WHERE id = ${userId})`
    : filters.mine ? sql`AND (t.created_by = ${userId} OR t.assigned_to = ${userId})`
    : filters.assignedAgentId ? sql`AND t.assigned_to = ${filters.assignedAgentId}`
    : sql``

  const groups = filters.statusGroup !== 'all' ? STATUS_GROUPS[filters.statusGroup] : null
  const supportStatus = groups ? sql`AND st.status IN ${sql(groups.supportTickets)}` : sql``
  const followupStatus = groups ? sql`AND f.status IN ${sql(groups.followups)}` : sql``
  const callbackStatus = groups ? sql`AND cb.status IN ${sql(groups.callbacks)}` : sql``
  const ticketStatus = groups ? sql`AND t.status IN ${sql(groups.tickets)}` : sql``

  const unionBody = sql`
    SELECT
      'support_ticket'::text AS source_type, st.id AS source_id,
      COALESCE(st.reference, initcap(st.channel)) AS ticket_label, st.channel AS queue_or_channel,
      st.status, st.agent_id, st.updated_at, st.created_at, st.customer_id,
      st.issue_type, st.root_cause, NULL::text AS contact_label
    FROM support_tickets st
    WHERE 1=1 ${supportScope} ${supportStatus} ${workedSupportTicket(filters)}

    UNION ALL

    SELECT
      'followup', f.id, initcap(f.type), f.type, f.status, f.agent_id, f.updated_at, f.created_at, f.customer_id,
      NULL::text, NULL::text, NULL::text
    FROM followups f
    WHERE 1=1 ${followupScope} ${followupStatus} ${workedFollowup(filters)}

    UNION ALL

    SELECT
      'callback', cb.id, 'Callback', NULL, cb.status, cb.agent_id, cb.updated_at, cb.created_at, cb.customer_id,
      NULL::text, NULL::text, COALESCE(cb.contact_name, cb.contact_phone, cb.contact_email)
    FROM callbacks cb
    WHERE 1=1 ${callbackScope} ${callbackStatus} ${workedCallback(filters)}

    UNION ALL

    SELECT
      't2_ticket', t.id, t.ticket_number, t.queue, t.status, t.assigned_to,
      ${t2UpdatedAt()},
      (t.created_at::timestamp AT TIME ZONE 'UTC'), t.customer_id,
      NULL::text, NULL::text, NULL::text
    FROM tickets t
    WHERE 1=1 ${ticketScope} ${ticketStatus} ${workedT2Ticket(filters)}
  `

  // A single pass over the UNION ALL, not two (2026-09-17 audit follow-up):
  // count(*) OVER() gets the total row count for free alongside the page of
  // rows, in the same query - instead of running the whole 4-table UNION a
  // second time just to learn how many rows it would have produced.
  // The date range is applied inside each UNION branch (worked*() above),
  // since each source has its own history to check.
  const rows = await sql<(TicketHistoryRecord & { totalCount: string })[]>`
    SELECT
      x.source_type AS "sourceType", x.source_id AS "sourceId", x.ticket_label AS "ticketLabel",
      x.queue_or_channel AS "queueOrChannel", x.status, x.agent_id AS "agentId", p.full_name AS "agentName",
      x.updated_at AS "updatedAt", x.created_at AS "createdAt",
      x.customer_id AS "customerId", COALESCE(cu.name, x.contact_label) AS "customerName",
      x.issue_type AS "issueType", x.root_cause AS "rootCause",
      count(*) OVER ()::text AS "totalCount"
    FROM (${unionBody}) x
    LEFT JOIN profiles p ON p.id = x.agent_id
    LEFT JOIN customers cu ON cu.id = x.customer_id
    ORDER BY x.created_at DESC
    LIMIT ${filters.pageSize} OFFSET ${offset}
  `

  if (rows.length > 0) {
    const totalCount = Number(rows[0].totalCount)
    return { rows: rows.map(({ totalCount: _totalCount, ...row }) => row), totalCount }
  }

  // count(*) OVER() has no row to attach to when the page is past the end
  // of the result set (e.g. stale pagination after the underlying data
  // shrank) - fall back to a real count query only in that rare case. It
  // reuses unionBody, so the date range carries over and a page past the
  // end of a date-filtered set doesn't report the unfiltered total.
  const countRows = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM (${unionBody}) x`
  return { rows: [], totalCount: Number(countRows[0]?.count ?? 0) }
}
