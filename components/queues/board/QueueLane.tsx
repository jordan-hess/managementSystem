'use client'

import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cardId, laneStatus, targetFor, type BoardAgent, type LaneState } from '@/lib/queues/board'
import { queueOptionLabel } from '@/lib/queues/constants'
import AgentCard from './AgentCard'

const STATUS_BG: Record<LaneState, string> = {
  empty: 'bg-red-400',
  short: 'bg-amber-500',
  met: 'bg-green-500',
  over: 'bg-[#5b9bff]',
}

interface Props {
  queue: string
  /** Main and additional cards on this lane, one entry per card. */
  agents: { agent: BoardAgent; additional: boolean }[]
  /** The selected card's agent, for the Place button. */
  selectedAgent: BoardAgent | null
  selectedCardId: string | null
  canEdit: boolean
  onSelect: (id: string) => void
  onPlace: (queue: string) => void
}

export default function QueueLane({ queue, agents, selectedAgent, selectedCardId, canEdit, onSelect, onPlace }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${queue}` })
  const count = agents.length
  const target = targetFor(queue)
  const { state, label } = laneStatus(count, target)

  // Pop the badge only when the lane newly reaches "met" (not on first mount).
  const prevState = useRef<LaneState | null>(null)
  const [pop, setPop] = useState(false)
  useEffect(() => {
    const prev = prevState.current
    prevState.current = state
    setPop(prev !== null && prev !== 'met' && state === 'met')
  }, [state])

  // Not on a lane the selected card's agent already covers (main or additional).
  const canPlace = canEdit && selectedAgent !== null && !agents.some((a) => a.agent.id === selectedAgent.id)

  return (
    <section
      ref={setNodeRef}
      role="region"
      aria-label={`${queueOptionLabel(queue)} queue, ${count} of ${target}`}
      className={`flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition-transform dark:border-gray-700 dark:bg-gray-900 ${
        isOver ? 'scale-[1.02] ring-2 ring-[#5b9bff] shadow-lg motion-reduce:scale-100' : ''
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{queueOptionLabel(queue)}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-gray-900 ${STATUS_BG[state]} ${
            pop ? 'animate-badge-pop motion-reduce:animate-none' : ''
          }`}
        >
          {label}
        </span>
      </header>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${STATUS_BG[state]}`}
          style={{ width: `${Math.min(count / target, 1) * 100}%` }}
        />
      </div>
      <div className="flex min-h-11 flex-wrap gap-2">
        {agents.map(({ agent, additional }) => {
          const id = additional ? cardId(agent.id, queue) : cardId(agent.id)
          return (
            <AgentCard
              key={id}
              agent={agent}
              dragId={id}
              additional={additional}
              selected={selectedCardId === id}
              showDepartment={false}
              disabled={!canEdit}
              onSelect={onSelect}
            />
          )
        })}
      </div>
      {canPlace && selectedAgent && (
        <button
          type="button"
          onClick={() => onPlace(queue)}
          className="min-h-11 rounded-xl border border-dashed border-blue-400 px-3 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/20"
        >
          Place {selectedAgent.full_name.split(/\s+/)[0]} here
        </button>
      )}
    </section>
  )
}
