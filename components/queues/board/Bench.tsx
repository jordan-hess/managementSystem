'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cardId, type BoardAgent } from '@/lib/queues/board'
import AgentCard from './AgentCard'

const FILTERS = ['All', 'Social', 'T2', 'Billing'] as const
type Filter = (typeof FILTERS)[number]

const LEGEND: { label: string; dot: string }[] = [
  { label: 'T2', dot: 'bg-[#7cb6ff]' },
  { label: 'Social', dot: 'bg-pink-300' },
  { label: 'Billing', dot: 'bg-amber-300' },
]

interface Props {
  /** note: e.g. 'on Freescout' when the agent's main channel is off the board. */
  agents: { agent: BoardAgent; note: string | null }[]
  /** The selected card's agent, for the send-to-bench button. */
  selectedAgent: BoardAgent | null
  selectedCardId: string | null
  selectedOnBench: boolean
  canEdit: boolean
  onSelect: (id: string) => void
  onSendToBench: () => void
}

export default function Bench({ agents, selectedAgent, selectedCardId, selectedOnBench, canEdit, onSelect, onSendToBench }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'bench' })
  const [filter, setFilter] = useState<Filter>('All')
  const visible = filter === 'All' ? agents : agents.filter((a) => a.agent.department === filter)

  return (
    <aside
      ref={setNodeRef}
      aria-label="Bench"
      // Capped to the viewport (minus the sticky top-4 offset and a matching
      // gap below) so a long bench scrolls its own list instead of the page.
      className={`flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 min-[900px]:sticky min-[900px]:top-4 min-[900px]:max-h-[calc(100vh-2rem)] ${
        isOver ? 'ring-2 ring-[#5b9bff] shadow-lg' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Bench</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">{agents.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-11 rounded-full px-3 text-xs font-medium ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <ul className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400" aria-label="Colour legend">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-1">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${l.dot}`} />
            {l.label}
          </li>
        ))}
      </ul>
      {/* -m-1 p-1 keeps the selected card's ring from being clipped by the
          scroll edge. Stacked (below 900px) the list gets its own cap. */}
      <div className="-m-1 flex max-h-[60vh] min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain p-1 min-[900px]:max-h-none min-[900px]:flex-1">
        {visible.map(({ agent, note }) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            dragId={cardId(agent.id)}
            note={note}
            selected={selectedCardId === cardId(agent.id)}
            showDepartment={filter === 'All'}
            disabled={!canEdit}
            onSelect={onSelect}
          />
        ))}
        {visible.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No agents on the bench.</p>
        )}
      </div>
      {canEdit && selectedAgent && !selectedOnBench && (
        <button
          type="button"
          onClick={onSendToBench}
          className="min-h-11 rounded-xl border border-dashed border-gray-400 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-500 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Send {selectedAgent.full_name} back to the bench
        </button>
      )}
    </aside>
  )
}
