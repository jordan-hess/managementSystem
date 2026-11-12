'use client'

// T2 Queue Hub merge — the Home page's "Completed by You" panel for
// CMS-origin agents (MyCompletedWorkConsole) breaks down by
// escalations/follow-ups/callbacks/Freescout/WhatsApp/HelloPeter — none of
// which a T2-origin agent has access to or ever touches. This is the T2
// equivalent: completed tickets broken down by queue (Advanced, SIM SWAP,
// PORTING, VOICE) instead. Same Day/Week/Month toggle and tile layout as
// MyCompletedWorkConsole for visual consistency.

import { useState } from 'react'
import { CheckCircle2, Router, Smartphone, PhoneCall, ArrowLeftRight, Wallet, ListChecks, type LucideIcon } from 'lucide-react'
import { getBusinessToday, getISOWeekStart, formatDateKey } from '@/lib/roster/calendarUtils'

type Period = 'day' | 'week' | 'month'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

function inPeriod(iso: string, period: Period): boolean {
  const today = getBusinessToday()
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  if (period === 'day') return formatDateKey(d) === formatDateKey(today)
  if (period === 'week') return d >= getISOWeekStart(today) && d <= today
  return d >= new Date(today.getFullYear(), today.getMonth(), 1) && d <= today
}

const QUEUE_CONFIG: { queue: string; label: string; icon: LucideIcon; tone: string }[] = [
  { queue: 'ADVANCED', label: 'Advanced', icon: Router, tone: 'bg-blue-600' },
  { queue: 'SIM SWAP', label: 'SIM Swap', icon: Smartphone, tone: 'bg-purple-600' },
  { queue: 'PORTING', label: 'MNP', icon: ArrowLeftRight, tone: 'bg-amber-500' },
  { queue: 'VOICE', label: 'Voice', icon: PhoneCall, tone: 'bg-green-600' },
  { queue: 'BILLING', label: 'Billing', icon: Wallet, tone: 'bg-teal-600' },
]

interface Props {
  tickets: { queue: string; resolved_at: string | null }[]
  // 'YYYY-MM-DD' day strings, one per ticket this agent touched (created OR
  // had a status change attributed to them) — distinct from the resolution-
  // only queue tiles above. See lib/reports/ticketsWorkedByAgent.ts.
  ticketsWorkedDays?: string[]
}

function Tile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-2 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between mb-1">
        <div className={`${tone} rounded-lg p-1.5`}><Icon className="w-3.5 h-3.5 text-white" /></div>
        <span className="text-base font-bold text-gray-900 dark:text-white">{value}</span>
      </div>
      <p className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">{label}</p>
    </div>
  )
}

export default function T2CompletedWorkConsole({ tickets, ticketsWorkedDays = [] }: Props) {
  const [period, setPeriod] = useState<Period>('day')

  const done = tickets.filter((t) => t.resolved_at && inPeriod(t.resolved_at, period))
  const counts = Object.fromEntries(QUEUE_CONFIG.map(({ queue }) => [queue, done.filter((t) => t.queue === queue).length]))
  const total = done.length
  const ticketsWorked = ticketsWorkedDays.filter((d) => inPeriod(d, period)).length

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-3 shrink-0">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Completed by You</h3>
        <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
          {PERIODS.map((p) => (
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
      <div className="grid grid-cols-7 gap-1.5">
        {QUEUE_CONFIG.map(({ queue, label, icon, tone }) => (
          <Tile key={queue} icon={icon} label={label} value={counts[queue] ?? 0} tone={tone} />
        ))}
        <Tile icon={ListChecks} label="Tickets Worked" value={ticketsWorked} tone="bg-slate-600" />
        <Tile icon={CheckCircle2} label="Total" value={total} tone="bg-gray-700" />
      </div>
    </div>
  )
}
