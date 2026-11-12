'use client'

// T2 Queue Hub merge — ported from
// t2-queue-hub/frontend/src/components/QueueVisibility.jsx. Data is fetched
// server-side by the page (no client polling loop yet — see the merge's
// realtime-approach note; a refresh of the page picks up changes).

import { useState } from 'react'

interface QueueAgent { user_id: string; full_name: string }
interface Props {
  date: string
  queues: string[]
  byQueue: Record<string, QueueAgent[]>
}

export default function QueueVisibility({ queues, byQueue }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {queues.map((q) => {
        const agents = byQueue[q] ?? []
        const isOpen = expanded === q
        return (
          <div
            key={q}
            onClick={() => setExpanded(isOpen ? null : q)}
            className="cursor-pointer bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3 hover:border-blue-300 dark:hover:border-blue-800 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900 dark:text-white">{q}</span>
              <span className="text-xs text-gray-500 dark:text-gray-500">{agents.length} agent{agents.length === 1 ? '' : 's'}</span>
            </div>
            {isOpen && (
              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1">
                {agents.length === 0 && <div className="text-xs text-gray-400 dark:text-gray-600">No agents assigned</div>}
                {agents.map((a) => (
                  <div key={a.user_id} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" /> {a.full_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
