'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { setMyAgentStatusAction, getMyAgentStatusAction } from '@/lib/agentStatus/actions'
import { AGENT_STATUS_OPTIONS, AgentStatusValue } from '@/lib/agentStatus/constants'

/**
 * Self-service "My Status" pill, mounted next to MyQueueWidget in Header's
 * extraAction on /tickets. Unlike MyQueueWidget there's no reason/history
 * fields — just the fixed AGENT_STATUS_OPTIONS list — so picking a row
 * applies immediately instead of needing a separate Save step. Picking
 * "Inactive" here is also how an agent marks themselves as having left work.
 */
export default function MyAgentStatusToggle() {
  const [status, setStatus] = useState<AgentStatusValue>('active')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getMyAgentStatusAction().then((res) => {
      if (res.data) setStatus(res.data.status)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function selectStatus(value: AgentStatusValue) {
    if (value === status) { setOpen(false); return }
    const previous = status
    setStatus(value)
    setSaving(true)
    setError('')
    const result = await setMyAgentStatusAction(value)
    setSaving(false)
    if (result.error) { setError(result.error); setStatus(previous); return }
    setOpen(false)
  }

  const current = AGENT_STATUS_OPTIONS.find((o) => o.value === status) ?? AGENT_STATUS_OPTIONS[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Change your status"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <>
            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${current.dotClass}`} />
            <span className="font-semibold">{current.label}</span>
          </>
        )}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-1.5 z-50 space-y-0.5">
          {AGENT_STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => selectStatus(o.value)}
              disabled={saving}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors ${
                o.value === status ? 'bg-gray-100 dark:bg-gray-800 font-medium text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${o.dotClass}`} />
              {o.label}
            </button>
          ))}
          {error && <p className="px-2.5 pt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
