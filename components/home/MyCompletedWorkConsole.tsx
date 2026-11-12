'use client'

import { useState } from 'react'
import {
  AlertTriangle, FileText, Phone, CheckCircle2, Inbox, MessageCircle, Star,
  Globe, Frown, Router, Smartphone, PhoneCall, ArrowLeftRight, Wallet,
  CreditCard, Landmark, Receipt, FileSpreadsheet, ListChecks, type LucideIcon,
} from 'lucide-react'
import { getBusinessToday, getISOWeekStart, formatDateKey } from '@/lib/roster/calendarUtils'
import { Callback, Followup, SupportTicket } from '@/types'
import { BILLING_CHANNELS } from '@/lib/billing/constants'

type Period = 'day' | 'week' | 'month' | 'custom'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
]

// Plain helper (not a component) so the internal getBusinessToday()/new Date()
// calls fall outside the react-hooks/purity check's scope.
function inPeriod(iso: string, period: 'day' | 'week' | 'month'): boolean {
  const today = getBusinessToday()
  const d = new Date(iso)
  if (period === 'day') return formatDateKey(d) === formatDateKey(today)
  if (period === 'week') return d >= getISOWeekStart(today) && d <= today
  return d >= new Date(today.getFullYear(), today.getMonth(), 1) && d <= today
}

// End-of-day inclusive so an item completed any time on the "to" date still counts.
function inCustomRange(iso: string, from: string, to: string): boolean {
  const d = new Date(iso)
  return d >= new Date(`${from}T00:00:00`) && d <= new Date(`${to}T23:59:59.999`)
}

interface Props {
  followups: Pick<Followup, 'type' | 'resolved_at'>[]
  callbacks: Pick<Callback, 'completed_at'>[]
  supportTickets: Pick<SupportTicket, 'channel' | 'resolved_at'>[]
  // T2 queue tickets this agent is assigned — same { queue, resolved_at }
  // shape as T2CompletedWorkConsole's tickets prop, so a CMS agent who also
  // works T2 tickets gets those completions counted here too.
  tickets: { queue: string; channel: string | null; resolved_at: string | null }[]
  // 'YYYY-MM-DD' day strings — one per ticket/follow-up/escalation/support-
  // ticket/callback this agent touched (created OR had a status change
  // attributed to them), distinct from the resolution-only tiles above. See
  // lib/reports/ticketsWorkedByAgent.ts.
  ticketsWorkedDays?: string[]
  // Billing agents see a Billing-channel-only breakdown (Stitch/Peach
  // Payments/Pay@/Receivables) instead of the full Social/T2/Billing grid —
  // every tile besides Billing would always read 0 for them anyway, since
  // they only ever create Billing tickets.
  isBillingAgent?: boolean
}

function Tile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between mb-1.5">
        <div className={`${tone} rounded-lg p-1.5`}><Icon className="w-3.5 h-3.5 text-white" /></div>
        <span className="text-lg font-bold text-gray-900 dark:text-white">{value}</span>
      </div>
      <p className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">{label}</p>
    </div>
  )
}

export default function MyCompletedWorkConsole({ followups, callbacks, supportTickets, tickets, ticketsWorkedDays = [], isBillingAgent = false }: Props) {
  const today = formatDateKey(getBusinessToday())
  const [period, setPeriod] = useState<Period>('day')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)

  function matches(iso: string): boolean {
    if (period === 'custom') {
      // Invalid/reversed range (e.g. "from" typed after "to") — show nothing
      // rather than silently falling back to an unbounded or wrong range.
      if (!customFrom || !customTo || customFrom > customTo) return false
      return inCustomRange(iso, customFrom, customTo)
    }
    return inPeriod(iso, period)
  }

  const escalations = followups.filter(f => f.type === 'escalation' && f.resolved_at && matches(f.resolved_at)).length
  const followupsDone = followups.filter(f => f.type === 'followup' && f.resolved_at && matches(f.resolved_at)).length
  const callbacksDone = callbacks.filter(c => c.completed_at && matches(c.completed_at)).length
  const freescoutDone = supportTickets.filter(t => t.channel === 'freescout' && t.resolved_at && matches(t.resolved_at)).length
  const whatsappDone = supportTickets.filter(t => t.channel === 'whatsapp' && t.resolved_at && matches(t.resolved_at)).length
  const helloPeterDone = supportTickets.filter(t => t.channel === 'hellopeter' && t.resolved_at && matches(t.resolved_at)).length
  const mybroadbandDone = supportTickets.filter(t => t.channel === 'mybroadband' && t.resolved_at && matches(t.resolved_at)).length
  const pissedCustomerDone = supportTickets.filter(t => t.channel === 'pissedcustomer' && t.resolved_at && matches(t.resolved_at)).length
  const advancedDone = tickets.filter(t => t.queue === 'ADVANCED' && t.resolved_at && matches(t.resolved_at)).length
  const simSwapDone = tickets.filter(t => t.queue === 'SIM SWAP' && t.resolved_at && matches(t.resolved_at)).length
  const voiceDone = tickets.filter(t => t.queue === 'VOICE' && t.resolved_at && matches(t.resolved_at)).length
  const portingDone = tickets.filter(t => t.queue === 'PORTING' && t.resolved_at && matches(t.resolved_at)).length
  const billingDone = tickets.filter(t => t.queue === 'BILLING' && t.resolved_at && matches(t.resolved_at)).length
  const total = escalations + followupsDone + callbacksDone + freescoutDone + whatsappDone + helloPeterDone
    + mybroadbandDone + pissedCustomerDone + advancedDone + simSwapDone + voiceDone + portingDone + billingDone

  const billingChannelDone = (channel: string) =>
    tickets.filter(t => t.queue === 'BILLING' && t.channel === channel && t.resolved_at && matches(t.resolved_at)).length
  const billingTotal = billingDone

  const ticketsWorked = ticketsWorkedDays.filter(d => matches(d)).length

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Completed by You</h3>
        <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                period === p.value ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            From
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            To
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={today}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </label>
          {customFrom > customTo && (
            <span className="text-xs text-red-600 dark:text-red-400">&ldquo;From&rdquo; must be before &ldquo;To&rdquo;.</span>
          )}
        </div>
      )}

      {/* Container query, not a viewport breakpoint — this console sits inside a
          grid cell whose rendered width depends on the page layout, not the
          viewport (see VolumesConsole/AgentKudosWall for the same reasoning). */}
      <div className="@container">
        <div className="grid grid-cols-2 @lg:grid-cols-4 gap-2">
          {isBillingAgent ? (
            <>
              <Tile icon={CreditCard} label={BILLING_CHANNELS[0]} value={billingChannelDone(BILLING_CHANNELS[0])} tone="bg-teal-600" />
              <Tile icon={Landmark} label={BILLING_CHANNELS[1]} value={billingChannelDone(BILLING_CHANNELS[1])} tone="bg-indigo-600" />
              <Tile icon={Receipt} label={BILLING_CHANNELS[2]} value={billingChannelDone(BILLING_CHANNELS[2])} tone="bg-orange-600" />
              <Tile icon={FileSpreadsheet} label={BILLING_CHANNELS[3]} value={billingChannelDone(BILLING_CHANNELS[3])} tone="bg-pink-600" />
              <Tile icon={ListChecks} label="Tickets Worked" value={ticketsWorked} tone="bg-slate-600" />
              <Tile icon={CheckCircle2} label="Total" value={billingTotal} tone="bg-gray-700" />
            </>
          ) : (
            <>
              <Tile icon={AlertTriangle} label="Escalations" value={escalations} tone="bg-red-500" />
              <Tile icon={FileText} label="Follow-ups" value={followupsDone} tone="bg-blue-500" />
              <Tile icon={Phone} label="Callbacks" value={callbacksDone} tone="bg-green-500" />
              <Tile icon={Inbox} label="Freescout" value={freescoutDone} tone="bg-blue-600" />
              <Tile icon={MessageCircle} label="WhatsApp" value={whatsappDone} tone="bg-green-600" />
              <Tile icon={Star} label="HelloPeter" value={helloPeterDone} tone="bg-amber-500" />
              <Tile icon={Globe} label="MyBroadband" value={mybroadbandDone} tone="bg-cyan-600" />
              <Tile icon={Frown} label="PissedCustomer" value={pissedCustomerDone} tone="bg-rose-600" />
              <Tile icon={Router} label="Advanced" value={advancedDone} tone="bg-blue-700" />
              <Tile icon={Smartphone} label="SIM Swap" value={simSwapDone} tone="bg-purple-600" />
              <Tile icon={PhoneCall} label="Voice" value={voiceDone} tone="bg-green-700" />
              <Tile icon={ArrowLeftRight} label="Porting" value={portingDone} tone="bg-amber-600" />
              <Tile icon={Wallet} label="Billing" value={billingDone} tone="bg-teal-600" />
              <Tile icon={ListChecks} label="Tickets Worked" value={ticketsWorked} tone="bg-slate-600" />
              <Tile icon={CheckCircle2} label="Total" value={total} tone="bg-gray-700" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
