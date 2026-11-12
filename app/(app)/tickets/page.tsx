import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import Header from '@/components/layout/Header'
import MyQueueWidget from '@/components/tickets/MyQueueWidget'
import MyAgentStatusToggle from '@/components/tickets/MyAgentStatusToggle'
import TicketsPageClient from '@/components/tickets/TicketsPageClient'
import { getUnifiedTicketList, UnifiedTicketFilters } from '@/lib/tickets/getUnifiedTicketList'
import { TICKET_STATUS_BUCKETS } from '@/components/tickets/statusBadges'
import { AnyQueue } from '@/lib/queues/constants'
import { getFollowupQueueOptionsForAgent } from '@/lib/queues/followupQueueOptions'
import { isBillingAgent } from '@/lib/billing/constants'
import { ActiveAssistanceSource, CaseCategory, FollowupAssignee, Role } from '@/types'

interface TeamLeaderCandidateRow { profile_id: string; profiles: (FollowupAssignee & { is_active: boolean }) | null }

const PAGE_SIZE = 25
const VALID_SOURCES: ActiveAssistanceSource[] = ['support_ticket', 'followup', 'callback', 't2_ticket']

// Phase 2's unified Tickets page — replaces /customers, /support-tickets,
// and every /t2 route (see next.config.ts's redirects()). URL state covers
// every list-affecting filter, not just customer selection, so the view is
// shareable/bookmarkable and the server (not client state) stays the
// source of truth, consistent with this app's existing
// Server-Component-fetches-per-render pattern.
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const userId = await getCurrentUserId()

  const [profile] = await sql<{ role: Role; full_name: string; department: string | null; t2_team: string | null; team_department: string | null }[]>`
    SELECT p.role, p.full_name, p.department, p.t2_team,
      (SELECT t.department FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.profile_id = p.id LIMIT 1) AS team_department
    FROM profiles p WHERE p.id = ${userId!}
  `
  const role = profile?.role ?? 'agent'
  const isAdmin = role === 'admin'
  const isManagement = role === 'management' || role === 'hod'
  const privileged = role === 'admin' || role === 'management' || role === 'hod' || role === 'team_leader'
  const canAssign = isAdmin || isManagement
  const isBillingAgentUser = isBillingAgent(profile)
  // Department-scoped queue/channel options for the standalone Follow-up/
  // Callback modals (see lib/queues/followupQueueOptions.ts) — resolved
  // server-side since it depends on this agent's own department and, for
  // T2, their currently self-set active queue.
  const followupQueueOptions = await getFollowupQueueOptionsForAgent(userId!, profile ?? {})

  // Billing agents only ever work Billing tickets — pin their view to it
  // regardless of any ?queue= in the URL, rather than letting them browse
  // (empty, since they have no tickets there) Social/T2 queues.
  const queue = (isBillingAgentUser ? 'BILLING' : (params.queue ?? 'all')) as AnyQueue | 'all'
  const page = Math.max(0, Number(params.page ?? 0) || 0)
  const mine = params.mine === 'true'
  const assignedAgentId = privileged ? (params.agent ?? '') : ''

  // Validated (not a blind cast) so a stale ?status=closed link (or any
  // other unrecognized value) degrades to the default instead of crashing
  // getUnifiedTicketList's STATUS_GROUPS lookup. Must match
  // TicketListTable.tsx's own STATUS_GROUPS exactly - 'all' was previously
  // missing here, so clicking "All" set ?status=all but silently fell
  // through to the 'active' default instead of actually showing every status.
  const statusGroup: UnifiedTicketFilters['statusGroup'] =
    params.status === 'active' || params.status === 'resolved' || params.status === 'all' ? params.status : 'active'

  // Date range on last-updated. Validated to 'YYYY-MM-DD' rather than
  // passed through, so a hand-edited ?from=garbage degrades to "no filter"
  // instead of reaching Postgres as a bad ::date cast and 500ing the page.
  const dateParam = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
  let updatedFrom = dateParam(params.from)
  let updatedTo = dateParam(params.to)
  // A backwards range would silently return nothing; swap it instead.
  if (updatedFrom && updatedTo && updatedFrom > updatedTo) [updatedFrom, updatedTo] = [updatedTo, updatedFrom]

  const dateRange = { updatedFrom, updatedTo }

  // A single queue filters on its own status buckets. Anything else in
  // ?status= (e.g. 'active' carried over from the All-queues view) means
  // "All" — passing it through matched no bucket and returned nothing.
  const nativeStatus = params.status && TICKET_STATUS_BUCKETS.some(b => b.key === params.status) ? params.status : undefined

  const filters: UnifiedTicketFilters = queue === 'all'
    ? { queue, statusGroup, mine, assignedAgentId: assignedAgentId || undefined, ...dateRange, page, pageSize: PAGE_SIZE }
    : { queue, statusGroup: 'all', nativeStatus, mine, assignedAgentId: assignedAgentId || undefined, ...dateRange, page, pageSize: PAGE_SIZE }

  const customerId = params.customer || null
  const source = params.source && VALID_SOURCES.includes(params.source as ActiveAssistanceSource) ? (params.source as ActiveAssistanceSource) : null
  const sourceId = source ? (params.id || null) : null

  let agentCandidates: FollowupAssignee[] = []
  let teamLeaderCandidates: TeamLeaderCandidateRow[] = []
  let callbackAgents: { id: string; full_name: string }[] = []

  const [{ rows, totalCount }, customers, categories] = await Promise.all([
    getUnifiedTicketList(filters, { userId: userId!, role }),
    sql<{ id: string; name: string; phone: string; email: string | null }[]>`SELECT id, name, phone, email FROM customers ORDER BY name ASC`,
    sql<CaseCategory[]>`SELECT * FROM case_categories ORDER BY name ASC`,
  ])

  if (isManagement || isAdmin) {
    const [agentProfiles, leaders] = await Promise.all([
      sql<FollowupAssignee[]>`
        SELECT p.id, p.full_name, p.email, p.department, p.t2_team,
          (SELECT t.department FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.profile_id = p.id LIMIT 1) AS team_department
        FROM profiles p WHERE p.role = 'agent' AND p.is_active = true ORDER BY p.full_name ASC
      `,
      sql<TeamLeaderCandidateRow[]>`
        SELECT tl.profile_id, jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'is_active', p.is_active) AS profiles
        FROM team_leaders tl
        JOIN profiles p ON p.id = tl.profile_id
      `,
    ])
    agentCandidates = agentProfiles
    teamLeaderCandidates = leaders
    if (isAdmin) callbackAgents = agentProfiles
  }

  return (
    <div>
      <Header
        title="Tickets"
        userId={userId!}
        userRole={role}
        extraAction={
          <div className="flex items-center gap-2">
            <MyAgentStatusToggle />
            <MyQueueWidget isBillingAgent={isBillingAgentUser} />
          </div>
        }
      />
      <div className="p-6">
        <TicketsPageClient
          rows={rows}
          totalCount={totalCount}
          page={page}
          pageSize={PAGE_SIZE}
          queue={queue}
          statusGroup={filters.statusGroup}
          nativeStatus={filters.nativeStatus ?? ''}
          mine={mine}
          assignedAgentId={assignedAgentId}
          updatedFrom={updatedFrom ?? ''}
          updatedTo={updatedTo ?? ''}
          privileged={privileged}
          customers={customers}
          agentCandidates={agentCandidates}
          teamLeaderCandidates={teamLeaderCandidates}
          categories={categories}
          callbackAgents={callbackAgents}
          userId={userId!}
          isAdmin={isAdmin}
          canAssign={canAssign}
          isBillingAgent={isBillingAgentUser}
          followupQueueOptions={followupQueueOptions}
          initialCustomerId={customerId}
          initialSource={source}
          initialSourceId={sourceId}
        />
      </div>
    </div>
  )
}
