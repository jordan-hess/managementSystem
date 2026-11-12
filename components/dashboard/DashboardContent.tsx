'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Phone, FileText, CheckCircle, Clock, AlertTriangle, Users, Inbox, MessageCircle, Star, type LucideIcon } from 'lucide-react'
import { Callback, Customer, Followup, SupportTicket, Warning } from '@/types'
import MyCompletedWorkConsole from '@/components/home/MyCompletedWorkConsole'
import WarningsPanel from './WarningsPanel'

// Stat icons are referenced by name (not by component) because DashboardContentProps
// crosses the server -> client boundary into ConsoleDesktop (a 'use client' component
// tree). React Server Components can only serialize plain data across that boundary —
// a raw component/function reference (e.g. `icon: Users`) is not serializable and
// crashes with "Functions cannot be passed directly to Client Components".
export type StatIconName = 'users' | 'phone' | 'file-text' | 'alert-triangle' | 'inbox' | 'message-circle' | 'star'

const STAT_ICONS: Record<StatIconName, LucideIcon> = {
  users: Users,
  phone: Phone,
  'file-text': FileText,
  'alert-triangle': AlertTriangle,
  inbox: Inbox,
  'message-circle': MessageCircle,
  star: Star,
}

export interface DashboardStat {
  label: string
  value: number
  icon: StatIconName
  color: string
  href: string
}

// Narrowed to exactly what this panel renders (rather than the full DB row
// shape) so support_tickets rows marked callback/follow_up can be merged in
// alongside real callbacks/followups — see app/(app)/dashboard/page.tsx.
// Every existing caller passing full Callback[]/Followup[] already satisfies
// these structurally, so no caller needs to change.
export type CallbackDisplayItem = Pick<Callback, 'id' | 'scheduled_at' | 'query_description'> & { customers: Pick<Customer, 'name' | 'phone'> | null }
export type FollowupDisplayItem = Pick<Followup, 'id' | 'type' | 'query_description' | 'priority'> & { customers: Pick<Customer, 'name'> | null }
// Escalations are followups with type = 'escalation' (see followups.type CHECK
// constraint) assigned by a team leader/manager — assigned_by_name surfaces
// who sent it, resolved via followups.created_by, since that's the one thing
// distinguishing "assigned to me" here from an ordinary follow-up.
export type EscalationDisplayItem = Pick<Followup, 'id' | 'query_description' | 'priority'> & {
  customers: Pick<Customer, 'name'> | null
  assigned_by_name: string | null
}

export interface DashboardContentProps {
  stats: DashboardStat[]
  pendingCallbacks: CallbackDisplayItem[]
  openFollowups: FollowupDisplayItem[]
  urgentFollowups: Followup[]
  warnings: Warning[]
  // Omitted for the admin/management "my dashboard" preview windows (TeamleadersConsole,
  // AgentsConsole) — the Escalations console is an agent's-own-dashboard feature only.
  escalations?: EscalationDisplayItem[]
  // Omitted for the admin/management "my dashboard" preview windows (TeamleadersConsole,
  // AgentsConsole) — the "Completed by You" breakdown is an agent's-own-dashboard feature only.
  completedWork?: {
    followups: Pick<Followup, 'type' | 'resolved_at'>[]
    callbacks: Pick<Callback, 'completed_at'>[]
    supportTickets: Pick<SupportTicket, 'channel' | 'resolved_at'>[]
    tickets: { queue: string; channel: string | null; resolved_at: string | null }[]
  }
  // 'YYYY-MM-DD' day strings, one per ticket/follow-up/escalation/support-
  // ticket/callback this agent touched (created OR had a status change
  // attributed to them) — see lib/reports/ticketsWorkedByAgent.ts. Distinct
  // from completedWork, which only ever counts a resolution day.
  ticketsWorkedDays?: string[]
  // Defaults to shown (TeamleadersConsole/AgentsConsole keep their inline Warnings
  // panel) — the agent's own /dashboard sets this false since Warnings now lives
  // on their new /qa page instead.
  showWarnings?: boolean
  // Billing agents get a Billing-channel-only breakdown in "Completed by
  // You" instead of the full Social/T2/Billing tile grid — see
  // MyCompletedWorkConsole.tsx. Omitted (falsy) for TeamleadersConsole/
  // AgentsConsole's agent-preview windows, which don't currently thread a
  // viewed agent's department through.
  isBillingAgent?: boolean
}

/** One agent's dashboard, as viewed from a team leader/admin's "Agents" console window. */
export interface AgentConsoleData {
  agentId: string
  agentName: string
  data: DashboardContentProps
}

export default function DashboardContent({ stats, pendingCallbacks, openFollowups, urgentFollowups, warnings, escalations = [], completedWork, ticketsWorkedDays, showWarnings = true, isBillingAgent = false }: DashboardContentProps) {
  return (
    <div className="min-h-full flex-1 flex flex-col">
      <div className="flex-1 p-6 space-y-6">
      {/* Stats — enough tiles to fill a row (5, the agent's own count) sit in one row instead of wrapping 4+1 */}
      <div className={`grid grid-cols-2 ${stats.length <= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
        {stats.map(({ label, value, icon, color, href }) => {
          const Icon = STAT_ICONS[icon]
          return (
            <Link key={label} href={href} className="bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className={`${color} rounded-lg p-2`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{value}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{label}</p>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Callbacks */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-500" />
              Upcoming Callbacks
            </h2>
            <Link href="/support-tickets" className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {pendingCallbacks.slice(0, 5).length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No pending callbacks</p>
              </div>
            ) : (
              pendingCallbacks.slice(0, 5).map(cb => (
                <div key={cb.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{(cb.customers as any)?.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{(cb.customers as any)?.phone}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-1">{cb.query_description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Clock className="w-3.5 h-3.5 text-amber-500 ml-auto mb-0.5" />
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatDistanceToNow(new Date(cb.scheduled_at), { addSuffix: true })}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Escalations — followups with type = 'escalation', assigned by a team leader/manager */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Escalations
            </h2>
            <Link href="/support-tickets" className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {escalations.slice(0, 5).length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No escalations</p>
              </div>
            ) : (
              escalations.slice(0, 5).map(esc => (
                <div key={esc.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{esc.customers?.name}</p>
                      {esc.assigned_by_name && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">From {esc.assigned_by_name}</p>
                      )}
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-1">{esc.query_description}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      esc.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                      esc.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{esc.priority}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Open Follow-ups */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              Open Follow-ups
            </h2>
            <Link href="/support-tickets" className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {openFollowups.slice(0, 5).length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No open follow-ups</p>
              </div>
            ) : (
              openFollowups.slice(0, 5).map(fu => (
                <div key={fu.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{(fu.customers as any)?.name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          fu.type === 'escalation' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>{fu.type}</span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">{fu.query_description}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      fu.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                      fu.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{fu.priority}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {completedWork && (
        <MyCompletedWorkConsole
          followups={completedWork.followups}
          callbacks={completedWork.callbacks}
          supportTickets={completedWork.supportTickets}
          tickets={completedWork.tickets}
          ticketsWorkedDays={ticketsWorkedDays}
          isBillingAgent={isBillingAgent}
        />
      )}

      {urgentFollowups.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <h3 className="font-semibold text-red-800 dark:text-red-300 text-sm">Urgent Items Requiring Attention</h3>
          </div>
          <div className="space-y-1">
            {urgentFollowups.map(fu => (
              <p key={fu.id} className="text-sm text-red-700 dark:text-red-400">
                {(fu.customers as any)?.name} — {fu.query_description}
              </p>
            ))}
          </div>
        </div>
      )}
      </div>

      {showWarnings && <WarningsPanel warnings={warnings} />}
    </div>
  )
}
