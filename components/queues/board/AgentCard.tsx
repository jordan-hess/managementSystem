'use client'

import { useDraggable } from '@dnd-kit/core'
import { initials, type BoardAgent } from '@/lib/queues/board'

const AVATAR_BG: Record<BoardAgent['department'], string> = {
  T2: 'bg-[#7cb6ff]',
  Social: 'bg-pink-300',
  Billing: 'bg-amber-300',
}

const CARD_CLASS =
  'flex min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-left text-sm font-medium text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white'

interface Props {
  agent: BoardAgent
  /** Unique per card: an agent has one main card plus one per additional platform. */
  dragId: string
  /** A card for one of the agent's additional platforms, not their main channel. */
  additional?: boolean
  /** Small bench note, e.g. 'on Freescout' for a main channel that is off the board. */
  note?: string | null
  selected: boolean
  showDepartment: boolean
  disabled: boolean
  onSelect: (id: string) => void
}

type BodyProps = { agent: BoardAgent; showDepartment: boolean; additional?: boolean; note?: string | null }

function CardBody({ agent, showDepartment, additional, note }: BodyProps) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-gray-900 ${AVATAR_BG[agent.department]}`}
      >
        {initials(agent.full_name)}
      </span>
      <span className="min-w-0 truncate">{agent.full_name}</span>
      {additional && (
        <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          + additional
        </span>
      )}
      {note && <span className="shrink-0 text-xs font-normal italic text-gray-500 dark:text-gray-400">{note}</span>}
      {showDepartment && (
        <span className="shrink-0 text-xs font-normal text-gray-500 dark:text-gray-400">{agent.department}</span>
      )}
    </>
  )
}

// The card stays in place while dragging (dimmed as a placeholder); the
// moving copy is AgentCardOverlay, rendered in QueueBoard's DragOverlay so it
// isn't clipped by the bench's scrolling list.
export default function AgentCard({ agent, dragId, additional, note, selected, showDepartment, disabled, onSelect }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    disabled,
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-agent-id={agent.id}
      data-card-id={dragId}
      {...listeners}
      {...attributes}
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect(dragId)
      }}
      // Space starts a keyboard drag (keydown); stop its keyup from also
      // firing the button's click and toggling selection.
      onKeyUp={(e) => {
        if (e.key === ' ') e.preventDefault()
      }}
      className={`animate-card-in motion-reduce:animate-none ${CARD_CLASS} ${
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      } ${selected ? 'ring-2 ring-[#5b9bff]' : ''} ${isDragging ? 'opacity-40' : ''}`}
    >
      <CardBody agent={agent} showDepartment={showDepartment} additional={additional} note={note} />
    </button>
  )
}

// Presentational copy shown under the pointer while dragging. Not draggable
// itself: dnd-kit warns against registering the same id twice.
export function AgentCardOverlay({ agent, additional }: { agent: BoardAgent; additional: boolean }) {
  return (
    <div className={`${CARD_CLASS} cursor-grabbing shadow-lg`}>
      <CardBody agent={agent} showDepartment={false} additional={additional} />
    </div>
  )
}
