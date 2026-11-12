'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'
import DashboardContent, { AgentConsoleData } from '@/components/dashboard/DashboardContent'

export interface AgentsConsoleProps {
  agents: AgentConsoleData[]
}

export default function AgentsConsole({ agents }: AgentsConsoleProps) {
  const [selectedId, setSelectedId] = useState(agents[0]?.agentId ?? '')

  if (agents.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center p-6">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-4 mb-4">
          <Users className="w-6 h-6 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No agents yet</p>
      </div>
    )
  }

  const selected = agents.find(a => a.agentId === selectedId) ?? agents[0]

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <select
          value={selected.agentId}
          onChange={e => setSelectedId(e.target.value)}
          aria-label="Select agent"
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        >
          {agents.map(a => (
            <option key={a.agentId} value={a.agentId}>{a.agentName}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-auto">
        <DashboardContent {...selected.data} />
      </div>
    </div>
  )
}
