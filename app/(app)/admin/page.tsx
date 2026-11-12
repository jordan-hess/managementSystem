import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import Header from '@/components/layout/Header'
import { Users, Phone, FileText, AlertTriangle, TrendingUp, Inbox, Clock, CheckCircle, CalendarOff } from 'lucide-react'
import Link from 'next/link'
import EscalationManager from '@/components/admin/EscalationManager'
import { getAgentsOffOnDate, tomorrow } from '@/lib/roster/scheduleAlerts'
import { Callback, CaseCategory, Followup } from '@/types'

export default async function AdminDashboardPage() {
  const userId = await getCurrentUserId()

  const [
    agents,
    allCallbacks,
    allFollowups,
    allCustomers,
    teamLeaderRows,
    allPendingRequests,
    categories,
  ] = await Promise.all([
    sql<{ id: string; full_name: string; email: string }[]>`
      SELECT id, full_name, email FROM profiles WHERE role = 'agent' AND is_active = true
    `,
    sql<(Callback & { customers: { name: string; phone: string }; profiles: { full_name: string } })[]>`
      SELECT c.*,
        jsonb_build_object(
          'name',  COALESCE(cu.name, c.contact_name, c.contact_phone, c.contact_email, 'Callback contact'),
          'phone', COALESCE(cu.phone, c.contact_phone, c.contact_email, '')
        ) AS customers,
        jsonb_build_object('full_name', COALESCE(p.full_name, 'Deleted user')) AS profiles
      FROM callbacks c
      LEFT JOIN customers cu ON cu.id = c.customer_id
      LEFT JOIN profiles p ON p.id = c.agent_id
      ORDER BY c.scheduled_at ASC
    `,
    sql<(Followup & { customers: { name: string; phone: string }; profiles: { full_name: string }; case_categories: { id: string; name: string } | null })[]>`
      SELECT f.*,
        jsonb_build_object('name', cu.name, 'phone', cu.phone) AS customers,
        jsonb_build_object('full_name', COALESCE(p.full_name, 'Deleted user')) AS profiles,
        CASE WHEN cc.id IS NULL THEN NULL ELSE jsonb_build_object('id', cc.id, 'name', cc.name) END AS case_categories
      FROM followups f
      JOIN customers cu ON cu.id = f.customer_id
      LEFT JOIN profiles p ON p.id = f.agent_id
      LEFT JOIN case_categories cc ON cc.id = f.category_id
      ORDER BY f.created_at DESC
    `,
    sql<{ id: string; name: string; phone: string }[]>`SELECT id, name, phone FROM customers`,
    sql<{ team_id: string }[]>`SELECT team_id FROM team_leaders WHERE profile_id = ${userId!}`,
    sql<{ id: string; status: string; type: string; team_id: string | null }[]>`
      SELECT id, status, type, team_id FROM requests WHERE status = 'pending'`,
    sql<CaseCategory[]>`SELECT * FROM case_categories ORDER BY name ASC`,
  ])

  const pendingCallbacks = allCallbacks.filter(c => c.status === 'pending')
  const openFollowups = allFollowups.filter(f => ['open', 'in_progress'].includes(f.status))
  const escalations = allFollowups.filter(f => f.type === 'escalation')
  const urgentItems = allFollowups.filter(f => f.priority === 'urgent' && f.status !== 'resolved')
  // The Follow-ups panel below covers non-escalation follow-ups only —
  // escalations get their own dedicated section (EscalationManager) so
  // nothing appears twice.
  const openNonEscalationFollowups = openFollowups.filter(f => f.type !== 'escalation')
  const openEscalations = escalations.filter(f => ['open', 'in_progress'].includes(f.status))

  // "Off tomorrow" indicator — one batched check (lib/roster/scheduleAlerts.ts)
  // across every agent with an open escalation/follow-up, not per-row, so
  // this page still does one query round-trip regardless of list size.
  const offTomorrowAgentIds = Array.from(
    await getAgentsOffOnDate(
      [...new Set([...openEscalations, ...openNonEscalationFollowups].map(f => f.agent_id).filter((id): id is string => !!id))],
      tomorrow(),
    ),
  )

  // Team requests metric — scoped to leader's teams if applicable
  const teamLeaderTeamIds = teamLeaderRows.map(r => r.team_id)
  const isTeamLeader = teamLeaderTeamIds.length > 0
  const pendingTeamRequests = isTeamLeader
    ? allPendingRequests.filter(r => r.team_id && teamLeaderTeamIds.includes(r.team_id))
    : allPendingRequests

  const stats = [
    { label: 'Active Agents', value: agents?.length || 0, icon: Users, color: 'bg-blue-500', href: '/team-leaders' },
    { label: 'Total Customers', value: allCustomers?.length || 0, icon: TrendingUp, color: 'bg-green-500', href: '#' },
    { label: 'Pending Callbacks', value: pendingCallbacks.length, icon: Phone, color: 'bg-amber-500', href: '#callbacks' },
    { label: 'Open Follow-ups', value: openNonEscalationFollowups.length, icon: FileText, color: 'bg-indigo-500', href: '#followups' },
    { label: 'Escalations', value: escalations.length, icon: AlertTriangle, color: 'bg-red-500', href: '#escalations' },
    { label: 'Urgent Items', value: urgentItems.length, icon: AlertTriangle, color: 'bg-rose-600', href: '#escalations' },
    { label: isTeamLeader ? 'My Team Requests' : 'Team Requests', value: pendingTeamRequests.length, icon: Inbox, color: 'bg-purple-500', href: '/admin/requests' },
  ]

  return (
    <div>
      <Header title="Workflows" userId={userId!} userRole="admin" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, color, href }, index) => (
            <Link
              key={label}
              href={href}
              className={`bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow ${
                index === 6 ? 'col-span-2 lg:col-span-1' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`${color} rounded-lg p-2`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{value}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{label}</p>
            </Link>
          ))}
        </div>

        {/* Escalations — full manager (list + Send Escalation), not a preview */}
        <div id="escalations" className="scroll-mt-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Escalations</h2>
          </div>
          <EscalationManager
            agents={agents || []}
            customers={allCustomers || []}
            escalations={escalations}
            categories={categories || []}
            offTomorrowAgentIds={offTomorrowAgentIds}
          />
        </div>

        {/* Callbacks — every agent's pending callbacks, org-wide */}
        <div id="callbacks" className="scroll-mt-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-500" />
              Callbacks ({pendingCallbacks.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {pendingCallbacks.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No pending callbacks</p>
              </div>
            ) : pendingCallbacks.map(cb => (
              <div key={cb.id} className="px-5 py-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{cb.customers?.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{cb.customers?.phone}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Assigned to: {cb.profiles?.full_name}</p>
                </div>
                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                  <Clock className="w-3 h-3" />
                  {new Date(cb.scheduled_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Follow-ups — every agent's open follow-ups, org-wide (escalations excluded, they're above) */}
        <div id="followups" className="scroll-mt-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              Follow-ups ({openNonEscalationFollowups.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {openNonEscalationFollowups.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No open follow-ups</p>
              </div>
            ) : openNonEscalationFollowups.map(f => (
              <div key={f.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{f.customers?.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Assigned to: {f.profiles?.full_name}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-1">{f.query_description}</p>
                    {!!f.agent_id && offTomorrowAgentIds.includes(f.agent_id) && (
                      <p className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 mt-1 font-medium">
                        <CalendarOff className="w-3 h-3" /> {f.profiles?.full_name} is off tomorrow — consider reassigning
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      f.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                      f.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{f.priority}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      f.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{f.status.replace('_', ' ')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
