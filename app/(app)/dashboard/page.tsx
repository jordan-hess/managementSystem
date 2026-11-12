import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import DashboardContent, { DashboardStat, CallbackDisplayItem, FollowupDisplayItem, EscalationDisplayItem } from '@/components/dashboard/DashboardContent'
import { Callback, Followup, SupportTicket, Warning } from '@/types'
import { QUEUES } from '@/lib/t2/constants'
import { ReportFilters } from '@/lib/reports/filters'
import { resolvePeriod } from '@/lib/reports/dateRanges'
import { isGranularity } from '@/lib/reports/volumeOverTime'
import { getKpiSummary } from '@/lib/reports/kpis'
import { getVolumeOverTime } from '@/lib/reports/volumeOverTime'
import { getT2QueueSummary } from '@/lib/reports/t2QueueSummary'
import { getSocialChannelSummary } from '@/lib/reports/socialChannelSummary'
import { getFilterOptions } from '@/lib/reports/filterOptions'
import { getQueueBreakdownData } from '@/lib/reports/t2QueueBreakdown'
import { getSocialBreakdownData } from '@/lib/reports/socialIssueBreakdown'
import { getBillingSummary, getBillingReasonBreakdown, getBillingChannelBreakdown } from '@/lib/reports/billingSummary'
import { isBillingAgent } from '@/lib/billing/constants'
import { generateInsights } from '@/lib/reports/generateInsights'
import { getAllTicketsWorkedDays } from '@/lib/reports/ticketsWorkedByAgent'
import ManagementReportDashboard from '@/components/reports/ManagementReportDashboard'

interface ProfileGateFields {
  id: string
  email: string
  full_name: string
  role: string
  department: string | null
  avatar_url: string | null
  is_active: boolean
  force_password_change: boolean
  created_at: string
  updated_at: string
}
type CallbackWithCustomer = Callback & { customers: { name: string; phone: string } }
type FollowupWithCustomer = Followup & { customers: { name: string; phone: string }; assigned_by_name: string | null }
type SupportTicketWithCustomer = SupportTicket & { customers: { name: string; phone: string } }
type WarningWithIssuer = Warning & { issuer: { full_name: string } }
type T2TicketCallback = {
  id: string
  description: string | null
  callback_scheduled_at: string | null
  customers: { name: string; phone: string } | null
}

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function DashboardPage({ searchParams }: Props) {
  const userId = await getCurrentUserId()

  const [
    profileRows,
    callbacks,
    followups,
    customers,
    notifications,
    warnings,
    supportTickets,
    t2Callbacks,
    t2Tickets,
    ticketsWorkedDays,
  ] = await Promise.all([
    sql<ProfileGateFields[]>`SELECT id, email, full_name, role, department, avatar_url, is_active, force_password_change, created_at, updated_at
        FROM profiles WHERE id = ${userId!}`,
    sql<CallbackWithCustomer[]>`SELECT c.*,
        jsonb_build_object(
          'name',  COALESCE(cu.name, c.contact_name, c.contact_phone, c.contact_email, 'Callback contact'),
          'phone', COALESCE(cu.phone, c.contact_phone, c.contact_email, '')
        ) AS customers
        FROM callbacks c LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE c.agent_id = ${userId!} ORDER BY c.scheduled_at ASC`,
    sql<FollowupWithCustomer[]>`SELECT f.*, jsonb_build_object('name', cu.name, 'phone', cu.phone) AS customers, ab.full_name AS assigned_by_name
        FROM followups f JOIN customers cu ON cu.id = f.customer_id
        LEFT JOIN profiles ab ON ab.id = f.created_by
        WHERE f.agent_id = ${userId!} ORDER BY f.created_at DESC`,
    sql<{ id: string }[]>`SELECT id FROM customers WHERE created_by = ${userId!}`,
    sql<{ id: string }[]>`SELECT id FROM notifications WHERE recipient_id = ${userId!} AND read = false`,
    sql<WarningWithIssuer[]>`SELECT w.*, jsonb_build_object('full_name', COALESCE(p.full_name, 'Deleted user')) AS issuer
        FROM warnings w LEFT JOIN profiles p ON p.id = w.issued_by
        WHERE w.issued_to = ${userId!} ORDER BY w.created_at DESC`,
    sql<SupportTicketWithCustomer[]>`SELECT t.*, jsonb_build_object('name', cu.name, 'phone', cu.phone) AS customers
        FROM support_tickets t JOIN customers cu ON cu.id = t.customer_id
        WHERE t.agent_id = ${userId!}`,
    sql<T2TicketCallback[]>`SELECT t.id, t.description, t.callback_scheduled_at,
        CASE WHEN cu.id IS NULL THEN NULL ELSE jsonb_build_object('name', cu.name, 'phone', cu.phone) END AS customers
        FROM tickets t LEFT JOIN customers cu ON cu.id = t.customer_id
        WHERE t.assigned_to = ${userId!} AND t.status = 'callback'`,
    // assigned_to now starts as whoever raised the ticket (both create
    // actions set it), so it covers a Billing agent's own work on its own —
    // it no longer sits NULL until someone takes the ticket over. The
    // created_by arm is kept as a backstop for BILLING, whose tickets have
    // no takeover path of their own: nothing would re-populate assigned_to
    // if a purge ever nulled it (see purge-deactivated-profiles-*.sql).
    // A T2 ticket that IS taken over counts for its new assignee, not its
    // raiser — creator and resolver still genuinely differ there.
    sql<{ queue: string; channel: string | null; resolved_at: string | null }[]>`
      SELECT queue, channel, resolved_at FROM tickets
      WHERE assigned_to = ${userId!} OR (queue = 'BILLING' AND created_by = ${userId!})
    `,
    getAllTicketsWorkedDays(userId!),
  ])
  const profile = profileRows[0]
  const isBillingAgentUser = isBillingAgent(profile)

  const pendingCallbacks = callbacks?.filter(c => c.status === 'pending') || []
  const openFollowups = followups?.filter(f => ['open', 'in_progress'].includes(f.status)) || []
  const urgentFollowups = followups?.filter(f => f.priority === 'urgent' && f.status !== 'resolved') || []
  const openEscalations = followups?.filter(f => f.type === 'escalation' && ['open', 'in_progress'].includes(f.status)) || []
  const escalations: EscalationDisplayItem[] = openEscalations.map(f => ({
    id: f.id,
    query_description: f.query_description,
    priority: f.priority,
    customers: f.customers,
    assigned_by_name: f.assigned_by_name,
  }))
  const openSupportTickets = supportTickets?.filter(t => ['open', 'in_progress'].includes(t.status)) || []

  // Social ticket status control: a support_ticket marked callback/follow_up
  // is "visible to the assigned agent" by merging it into the same two
  // panels real callbacks/followups already populate — not a third,
  // separate widget. Stat-tile counts above (Pending Callbacks/Open
  // Follow-ups) deliberately keep counting only the real tables; this
  // merge only affects the two dashboard list panels.
  const ticketCallbacks = supportTickets?.filter(t => t.status === 'callback') || []
  const ticketFollowUps = supportTickets?.filter(t => t.status === 'follow_up') || []
  const mergedCallbacks: CallbackDisplayItem[] = [
    ...pendingCallbacks,
    ...ticketCallbacks.map(t => ({ id: t.id, scheduled_at: t.callback_scheduled_at!, query_description: t.query_description, customers: t.customers })),
    // T2's own "Call back requested" outcome (tickets.status = 'callback') —
    // same merge pattern as support_tickets above, just a third source into
    // the same panel rather than a separate T2-only widget.
    ...(t2Callbacks ?? []).map(t => ({ id: t.id, scheduled_at: t.callback_scheduled_at!, query_description: t.description ?? '', customers: t.customers })),
  ].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const mergedFollowups: FollowupDisplayItem[] = [
    ...openFollowups,
    ...ticketFollowUps.map(t => ({ id: t.id, type: 'followup' as const, query_description: t.query_description, priority: t.priority, customers: t.customers })),
  ]
  const openFreescout = openSupportTickets.filter(t => t.channel === 'freescout')
  const openWhatsapp = openSupportTickets.filter(t => t.channel === 'whatsapp')
  const openHelloPeter = openSupportTickets.filter(t => t.channel === 'hellopeter')

  const stats: DashboardStat[] = [
    { label: 'My Customers', value: customers?.length || 0, icon: 'users', color: 'bg-blue-500', href: '/customers' },
    { label: 'Pending Callbacks', value: pendingCallbacks.length, icon: 'phone', color: 'bg-amber-500', href: '/support-tickets' },
    { label: 'Open Follow-ups', value: openFollowups.length, icon: 'file-text', color: 'bg-indigo-500', href: '/support-tickets' },
    { label: 'Unread Alerts', value: notifications?.length || 0, icon: 'alert-triangle', color: 'bg-red-500', href: '#' },
    { label: 'Open Escalations', value: openEscalations.length, icon: 'alert-triangle', color: 'bg-orange-500', href: '/support-tickets' },
    { label: 'Freescout Tickets', value: openFreescout.length, icon: 'inbox', color: 'bg-blue-600', href: '/support-tickets' },
    { label: 'WhatsApp Tickets', value: openWhatsapp.length, icon: 'message-circle', color: 'bg-green-500', href: '/support-tickets' },
    { label: 'HelloPeter Tickets', value: openHelloPeter.length, icon: 'star', color: 'bg-amber-500', href: '/support-tickets' },
  ]

  if (profile?.role === 'admin' || profile?.role === 'management' || profile?.role === 'hod') {
    const params = await searchParams
    const period = params.period ?? '30d'
    const { from, to } = resolvePeriod(period, params.from, params.to)
    const granularity = isGranularity(params.granularity) ? params.granularity : 'day'

    const filters: ReportFilters = {
      from,
      to,
      team: params.team === 't2' || params.team === 'social' ? params.team : 'all',
      queue: params.queue || undefined,
      issueType: params.issueType || undefined,
      rootCause: params.rootCause || undefined,
      status: params.status === 'open' || params.status === 'resolved' || params.status === 'escalated' ? params.status : 'all',
    }

    // T2 Queue Breakdown always shows one queue's tables — the global Queue
    // filter's value when it's a T2 queue, otherwise ADVANCED as the default tab.
    const breakdownQueue = filters.queue && (QUEUES as readonly string[]).includes(filters.queue) ? filters.queue : QUEUES[0]

    const [kpis, volumePoints, t2QueueSummary, socialChannelSummary, filterOptions, breakdownData, socialBreakdownData, billingSummary, billingReasonBreakdown, billingChannelBreakdown] = await Promise.all([
      getKpiSummary(filters),
      getVolumeOverTime(filters, granularity),
      getT2QueueSummary(filters),
      getSocialChannelSummary(filters),
      getFilterOptions(filters.team, filters.queue),
      getQueueBreakdownData(breakdownQueue, filters),
      getSocialBreakdownData(filters),
      getBillingSummary({ from: filters.from, to: filters.to }),
      getBillingReasonBreakdown({ from: filters.from, to: filters.to }),
      getBillingChannelBreakdown({ from: filters.from, to: filters.to }),
    ])

    const topBreakdownRow = [...breakdownData.primary.rows].sort((a, b) => b.pct - a.pct)[0]
    const socialTopBreakdownRow = [...socialBreakdownData.primary.rows].sort((a, b) => b.pct - a.pct)[0]
    const insights = generateInsights({
      kpis,
      t2QueueSummary,
      socialChannelSummary,
      topBreakdown: topBreakdownRow
        ? { label: `${breakdownQueue} ${breakdownData.primary.label.toLowerCase()}`, value: topBreakdownRow.value, pct: topBreakdownRow.pct }
        : undefined,
      socialTopBreakdown: socialTopBreakdownRow
        ? { label: `Social ${socialBreakdownData.primary.label.toLowerCase()}`, value: socialTopBreakdownRow.value, pct: socialTopBreakdownRow.pct }
        : undefined,
    })

    return (
      <div className="h-full overflow-y-auto p-4 sm:p-6">
        <ManagementReportDashboard
          filters={filters}
          period={period}
          granularity={granularity}
          kpis={kpis}
          volumePoints={volumePoints}
          t2QueueSummary={t2QueueSummary}
          socialChannelSummary={socialChannelSummary}
          breakdownQueue={breakdownQueue}
          breakdownData={breakdownData}
          socialBreakdownData={socialBreakdownData}
          billingSummary={billingSummary}
          billingReasonBreakdown={billingReasonBreakdown}
          billingChannelBreakdown={billingChannelBreakdown}
          filterOptions={filterOptions}
          insights={insights}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <DashboardContent
        // The Freescout/WhatsApp/HelloPeter channel breakdown lives in the
        // "Completed by You" console below instead — keeping it here too
        // would just duplicate it. (Only dropped from the agent's own top
        // stats row; admin/management's personal dashboardData above keeps
        // all eight tiles since their view has no Completed by You console.)
        stats={stats.filter(s => !['Freescout Tickets', 'WhatsApp Tickets', 'HelloPeter Tickets'].includes(s.label))}
        pendingCallbacks={mergedCallbacks}
        openFollowups={mergedFollowups}
        urgentFollowups={urgentFollowups}
        warnings={warnings || []}
        escalations={escalations}
        completedWork={{ followups: followups || [], callbacks: callbacks || [], supportTickets: supportTickets || [], tickets: t2Tickets || [] }}
        ticketsWorkedDays={ticketsWorkedDays || []}
        isBillingAgent={isBillingAgentUser}
        // Warnings and coaching feedback now live on the agent's own /qa page instead.
        showWarnings={false}
      />
    </div>
  )
}
