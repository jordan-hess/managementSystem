'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { AgentStatusValue } from '@/lib/agentStatus/constants'

interface AgentLite { id: string; full_name: string; is_active: boolean }

type BucketKey = 'active' | 'break' | 'meeting' | 'inactive'

interface Bucket {
  key: BucketKey
  label: string
  dotClass: string
  agents: AgentLite[]
}

interface Props {
  /** Every agent-role profile, active or not — see RosterPageData.allAgentsForStatus. */
  agents: AgentLite[]
  /** Self-reported Active/On Break/In a Meeting status, polled in RosterManager.tsx. */
  statusMap: Map<string, AgentStatusValue>
  /** Profile ids whose resolved schedule for today is effectiveStatus === 'off'
   *  (a rostered day off, or an explicit attendance override) — folded into
   *  Inactive alongside a deactivated account, since neither is someone to
   *  route work to today. */
  offTodayIds?: Set<string>
  /** Profile ids with an agent_login_log row for today (RosterPageData.loginLog).
   *  Active requires having actually logged in today - see the module comment. */
  loggedInIds: Set<string>
}

/**
 * A quick-glance summary of where every agent stands right now:
 *  - Active: logged in today (recordDailyActivity resets agent_status to
 *    'active' on that first login of the day) and no break/meeting/inactive
 *    override in effect.
 *  - On Break / In a Meeting: self-reported (lib/agentStatus/), on top of
 *    having logged in today.
 *  - Inactive: everyone else - either off today (a deactivated account, a
 *    rostered day off, or an explicit attendance override), or logged off
 *    (no login today at all, or agent_status.status = 'inactive' - set
 *    either by the agent themselves leaving work, or automatically once
 *    their shift for today has ended via applyShiftEndAutoInactive in
 *    lib/agentStatus/actions.ts).
 * Each chip expands into a dropdown listing who's in it.
 */
export default function AgentStatusIndicatorBar({ agents, statusMap, offTodayIds, loggedInIds }: Props) {
  const [open, setOpen] = useState<BucketKey | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const buckets: Bucket[] = [
    { key: 'active', label: 'Active', dotClass: 'bg-green-500', agents: [] },
    { key: 'break', label: 'On Break', dotClass: 'bg-orange-500', agents: [] },
    { key: 'meeting', label: 'In a Meeting', dotClass: 'bg-purple-500', agents: [] },
    { key: 'inactive', label: 'Inactive', dotClass: 'bg-gray-400', agents: [] },
  ]
  const byKey = Object.fromEntries(buckets.map(b => [b.key, b])) as Record<BucketKey, Bucket>

  for (const agent of agents) {
    const status = statusMap.get(agent.id)
    if (!agent.is_active || offTodayIds?.has(agent.id) || status === 'inactive') { byKey.inactive.agents.push(agent); continue }
    // Not logged in yet today = logged off, regardless of whatever
    // agent_status says (it may just be stale from a previous day).
    if (!loggedInIds.has(agent.id)) { byKey.inactive.agents.push(agent); continue }
    if (status === 'break') byKey.break.agents.push(agent)
    else if (status === 'meeting') byKey.meeting.agents.push(agent)
    else byKey.active.agents.push(agent)
  }

  return (
    <div ref={containerRef} className="flex flex-wrap gap-2">
      {buckets.map(b => (
        <div key={b.key} className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => (o === b.key ? null : b.key))}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${b.dotClass}`} />
            {b.label}
            <span className="text-gray-400 dark:text-gray-300">{b.agents.length}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {open === b.key && (
            <div className="absolute left-0 mt-1 w-56 max-h-64 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-40 p-1.5">
              {b.agents.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-1.5">No agents</p>
              ) : (
                b.agents.map(a => (
                  <p key={a.id} className="text-sm text-gray-700 dark:text-gray-300 px-2 py-1 rounded truncate">
                    {a.full_name}
                  </p>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
