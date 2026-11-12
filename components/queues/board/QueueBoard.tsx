'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, DragOverlay, type Announcements, type DragEndEvent } from '@dnd-kit/core'
import {
  QUEUE_GROUPS,
  agentLanes,
  autoFillPlan,
  cardId,
  coverage,
  laneCounts,
  laneOf,
  parseCardId,
  removedMainLabel,
  targetFor,
  type BoardAgent,
  type BoardDay,
  type QueueBoardProps,
} from '@/lib/queues/board'
import { MAX_ADDITIONAL_QUEUES, queueOptionLabel } from '@/lib/queues/constants'
import { applyBoardMovesAction, undoBoardChangesAction, type BoardChange, type BoardMove } from '@/lib/queues/actions'
import { AgentCardOverlay } from './AgentCard'
import AutoFillDialog from './AutoFillDialog'
import Bench from './Bench'
import BoardActions from './BoardActions'
import BoardToast, { type BoardToastData } from './BoardToast'
import CoverageBar from './CoverageBar'
import DayPicker from './DayPicker'
import HistoryList from './HistoryList'
import MoveOrAddDialog from './MoveOrAddDialog'
import QueueLane from './QueueLane'
import ReasonDialog from './ReasonDialog'
import { useBoardSensors } from './sensors'

type Tab = 'today' | 'week' | 'history'

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Plan the week' },
  { key: 'history', label: 'History' },
]

// dnd-kit's default instructions only mention Space; cards also select on Enter.
const KEYBOARD_HINT = 'Press Enter to select, then choose a lane. Press Space to drag.'

const EMPTY_DAY: BoardDay = { main: {}, additional: {} }

// Same UTC date math as lib/queues/assignments.ts (which can't be imported
// here: it pulls in the DB pool).
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDayMonth(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function weekdayName(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
}

function defaultWeekDay(today: string, weekDays: string[]): string {
  return weekDays.includes(today) ? today : weekDays[0]
}

// Toast and drag announcement for an additional-platform change. `from` is
// the stored value, `target` a lane.
function additionalMessage(name: string, from: string | null, target: string | null): string {
  if (target === null) return `Removed ${name} from ${queueOptionLabel(laneOf(from) ?? from ?? '')}`
  if (from !== null) return `Moved ${name}'s additional to ${queueOptionLabel(target)}`
  return `Added ${name} as additional on ${queueOptionLabel(target)}`
}

// Returns a copy of boards with each move applied to its own date. Mirrors
// what applyBoardMovesAction does on its own: a main sent to the bench takes
// all of that day's additionals with it, and a main moved onto the lane of
// one of its additionals drops that additional.
function applyMoves(boards: Record<string, BoardDay>, moves: BoardMove[]): Record<string, BoardDay> {
  const next = { ...boards }
  for (const m of moves) {
    const d = next[m.date] ?? EMPTY_DAY
    const mine = d.additional[m.userId] ?? []
    let main = d.main
    let additional: string[]
    if (m.kind === 'additional') {
      const kept = mine.filter((q) => q !== m.from)
      // A pending add replayed over a snapshot that already has it stays single.
      additional = m.queue === null || kept.includes(m.queue) ? kept : [...kept, m.queue]
    } else {
      main = { ...d.main, [m.userId]: m.queue }
      const lane = laneOf(m.queue)
      additional = m.queue === null ? [] : mine.filter((q) => lane === null || laneOf(q) !== lane)
    }
    next[m.date] = { main, additional: { ...d.additional, [m.userId]: additional } }
  }
  return next
}

// An agent-day as it was before a batch, so a failure or an undo puts back
// exactly the agents that batch touched.
type DaySnapshot = { userId: string; date: string; main: string | null; additional: string[] }

function snapshot(boards: Record<string, BoardDay>, moves: BoardMove[]): DaySnapshot[] {
  const seen = new Map<string, DaySnapshot>()
  for (const m of moves) {
    const key = `${m.userId}|${m.date}`
    if (seen.has(key)) continue
    const d = boards[m.date] ?? EMPTY_DAY
    seen.set(key, { userId: m.userId, date: m.date, main: d.main[m.userId] ?? null, additional: d.additional[m.userId] ?? [] })
  }
  return [...seen.values()]
}

function restore(boards: Record<string, BoardDay>, snaps: DaySnapshot[]): Record<string, BoardDay> {
  const next = { ...boards }
  for (const s of snaps) {
    const d = next[s.date] ?? EMPTY_DAY
    next[s.date] = { main: { ...d.main, [s.userId]: s.main }, additional: { ...d.additional, [s.userId]: s.additional } }
  }
  return next
}

/**
 * Moves that make `target` (a week day) match `source` (today's plan): main
 * moves first, then additional removals, then additional adds, so each step
 * passes the server's checks. An agent whose main today is off the board is
 * skipped, like the other bulk actions, and so is anyone whose main lane on
 * the target day won't match today's (their additionals can't be copied).
 */
function copyPlan(source: BoardDay, target: BoardDay, agents: BoardAgent[], date: string): BoardMove[] {
  const mains: BoardMove[] = []
  for (const a of agents) {
    const want = source.main[a.id] ?? null
    if (want !== null && laneOf(want) === null) continue
    const have = target.main[a.id] ?? null
    // A removed-lane main on the target day is left for the lead to place.
    if (have !== null && laneOf(have) === null) continue
    if (laneOf(want) !== laneOf(have)) mains.push({ userId: a.id, date, from: have, queue: want })
  }
  // The target day once the server has applied the main moves, including
  // the additionals they drop.
  const after = applyMoves({ [date]: target }, mains)[date]
  const removals: BoardMove[] = []
  const adds: BoardMove[] = []
  for (const a of agents) {
    const lane = laneOf(after.main[a.id])
    if (lane === null || lane !== laneOf(source.main[a.id])) continue
    const want = agentLanes(source, a.id).additional
    const kept: string[] = []
    for (const q of after.additional[a.id] ?? []) {
      const l = laneOf(q)
      if (l !== null && want.includes(l) && !kept.includes(l)) kept.push(l)
      else removals.push({ userId: a.id, date, kind: 'additional', from: q, queue: null })
    }
    for (const l of want) {
      if (kept.includes(l)) continue
      // Today's stored value, as the main moves copy theirs.
      const stored = (source.additional[a.id] ?? []).find((q) => laneOf(q) === l) ?? l
      adds.push({ userId: a.id, date, kind: 'additional', from: null, queue: stored })
    }
  }
  return [...mains, ...removals, ...adds]
}

// What dropping (or placing) a card on a lane, or on the bench (null), does.
type MovePlan =
  | { kind: 'none' }
  | { kind: 'main'; from: string | null; to: string | null }
  | { kind: 'choose'; from: string; to: string } // move the main there, or add as additional?
  | { kind: 'additional'; from: string; to: string | null }

function planMove(d: BoardDay, id: string, target: string | null): MovePlan {
  const { agentId, additionalLane } = parseCardId(id)
  const lanes = agentLanes(d, agentId)
  const covers = target !== null && (target === lanes.main || lanes.additional.includes(target))
  if (additionalLane !== null) {
    // The stored value behind the card (e.g. 'LinkedIn' in the combined lane).
    const stored = (d.additional[agentId] ?? []).find((q) => laneOf(q) === additionalLane)
    if (stored === undefined || covers) return { kind: 'none' }
    return { kind: 'additional', from: stored, to: target }
  }
  const from = d.main[agentId] ?? null
  // No main lane: the card is on the bench (perhaps with a main that is off
  // the board), so a lane is a plain placement and the bench is a no-op.
  if (from === null || lanes.main === null) return target === null ? { kind: 'none' } : { kind: 'main', from, to: target }
  if (target === null) return { kind: 'main', from, to: null }
  if (covers) return { kind: 'none' }
  return { kind: 'choose', from, to: target }
}

// Team Lead / Management: drag (or select-then-place) active agents between
// the bench and queue lanes. Every move is applied optimistically, saved via
// applyBoardMovesAction, and rolled back for just its own agents on failure.
export default function QueueBoard({ today, weekDays, agents, boards: initialBoards, canEdit, initialTab }: QueueBoardProps) {
  const router = useRouter()
  const sensors = useBoardSensors()

  const [boards, setBoards] = useState(initialBoards)
  // Mirrors `boards` synchronously so commit() can read the pre-move state of
  // back-to-back moves without waiting for a re-render.
  const boardsRef = useRef(initialBoards)
  const updateBoards = useCallback((fn: (b: Record<string, BoardDay>) => Record<string, BoardDay>) => {
    boardsRef.current = fn(boardsRef.current)
    setBoards(boardsRef.current)
  }, [])

  // Batches still awaiting applyBoardMovesAction. A refresh triggered by one
  // move's success must not wipe another move that is still saving, so these
  // are replayed over every server snapshot until they settle.
  const [pending, setPending] = useState<{ id: number; moves: BoardMove[] }[]>([])
  const batchSeq = useRef(0)

  // Re-seed when router.refresh() brings fresh server data. Adjusted during
  // render (not in an effect) per react-hooks/set-state-in-effect; the ref
  // catches up in the effect below.
  const [seededBoards, setSeededBoards] = useState(initialBoards)
  if (seededBoards !== initialBoards) {
    setSeededBoards(initialBoards)
    setBoards(applyMoves(initialBoards, pending.flatMap((b) => b.moves)))
  }
  useEffect(() => {
    boardsRef.current = boards
  }, [boards])

  const [tab, setTab] = useState<Tab>(initialTab)
  const [weekDay, setWeekDay] = useState(() => defaultWeekDay(today, weekDays))
  // weekDays is a fresh array on every render; its Monday identifies the week.
  const weekStart = weekDays[0]
  const [seededWeek, setSeededWeek] = useState(weekStart)
  if (seededWeek !== weekStart) {
    setSeededWeek(weekStart)
    setWeekDay(defaultWeekDay(today, weekDays))
  }
  const day = tab === 'week' ? weekDay : today

  // A card id (see cardId): an agent has a main card and one per additional.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<BoardToastData | null>(null)
  const toastSeq = useRef(0)
  const showToast = useCallback((t: Omit<BoardToastData, 'id'>) => setToast({ ...t, id: ++toastSeq.current }), [])
  const dismissToast = useCallback(() => setToast(null), [])

  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])
  // The main queue the board (including still-saving moves) has an agent on
  // right now; sent as each move's `from` so the server can refuse a stale batch.
  const queueNow = useCallback((userId: string, date: string) => boardsRef.current[date]?.main[userId] ?? null, [])
  const board = boards[day] ?? EMPTY_DAY

  const undoChanges = useCallback(
    async (changes: BoardChange[], prev: DaySnapshot[]) => {
      let res: Awaited<ReturnType<typeof undoBoardChangesAction>>
      try {
        res = await undoBoardChangesAction(changes)
      } catch {
        res = { error: 'Could not undo.' }
      }
      if (res.data) updateBoards((b) => restore(b, prev))
      else showToast({ message: res.error ?? 'Could not undo.', tone: 'error' })
      router.refresh()
    },
    [router, showToast, updateBoards],
  )

  // Single save path for every board mutation; the bulk actions call it with
  // multi-agent batches.
  const commit = useCallback(
    async (moves: BoardMove[], opts: { reason?: string; toast: string }) => {
      // Only the affected agent-days are remembered, so a failure can't
      // clobber other moves that landed meanwhile.
      const prev = snapshot(boardsRef.current, moves)
      updateBoards((b) => applyMoves(b, moves))
      setSelectedId(null)
      const batchId = ++batchSeq.current
      setPending((p) => [...p, { id: batchId, moves }])

      let res: Awaited<ReturnType<typeof applyBoardMovesAction>>
      try {
        res = await applyBoardMovesAction(moves, opts.reason)
      } catch {
        res = { error: 'Could not save the board.' }
      }
      setPending((p) => p.filter((b) => b.id !== batchId))
      if (!res.data) {
        updateBoards((b) => restore(b, prev))
        showToast({ message: res.error ?? 'Could not save the board.', tone: 'error' })
        // Most failures mean the board moved under us; show the real one.
        router.refresh()
        return
      }
      const changes = res.data
      showToast({
        message: opts.toast,
        tone: 'success',
        // Nothing to undo when the server found every move already in place.
        onUndo: changes.length > 0 ? () => void undoChanges(changes, prev) : undefined,
      })
      router.refresh()
    },
    [router, showToast, undoChanges, updateBoards],
  )

  // A placement waiting on "Move here" or "Add as additional platform".
  const [moveOrAdd, setMoveOrAdd] = useState<{ agentId: string; from: string; to: string } | null>(null)
  // A same-day lane-to-lane move waiting on the reason dialog.
  const [askReason, setAskReason] = useState<{ agentId: string; from: string; to: string } | null>(null)

  // A single-agent move remounts the card in another lane (and the Place
  // button or dialog that had focus goes away), so focus follows the card.
  // Holds a card id: an agent can have several cards.
  const focusAfterMove = useRef<string | null>(null)
  useEffect(() => {
    const id = focusAfterMove.current
    if (!id) return
    focusAfterMove.current = null
    const cards = document.querySelectorAll<HTMLElement>('[data-card-id]')
    Array.from(cards).find((el) => el.dataset.cardId === id)?.focus()
  })

  const saveMove = useCallback(
    (agentId: string, from: string | null, target: string | null, reason?: string) => {
      const agent = agentsById.get(agentId)
      if (!agent) return
      focusAfterMove.current = cardId(agentId)
      const where = target === null ? 'bench' : queueOptionLabel(target)
      void commit([{ userId: agentId, date: day, from, queue: target }], { reason, toast: `${agent.full_name} → ${where}` })
    },
    [agentsById, commit, day],
  )

  // Adds (from null), moves or removes (target null) one additional platform.
  // `from` is the stored value, `target` a lane. Never asks for a reason.
  const saveAdditional = useCallback(
    (agentId: string, from: string | null, target: string | null) => {
      const agent = agentsById.get(agentId)
      if (!agent) return
      focusAfterMove.current = target === null ? cardId(agentId) : cardId(agentId, target)
      void commit([{ userId: agentId, date: day, kind: 'additional', from, queue: target }], {
        toast: additionalMessage(agent.full_name, from, target),
      })
    },
    [agentsById, commit, day],
  )

  const [confirmAutoFill, setConfirmAutoFill] = useState(false)
  const autoPlan = autoFillPlan(board, agents)
  // Agents with a main on a board lane. A main that is off the board (e.g.
  // freescout) is left alone: they're working a live channel. The server
  // drops each cleared agent's additionals itself.
  const clearIds = agents.filter((a) => laneOf(board.main[a.id]) !== null).map((a) => a.id)
  // Changes that would make this day match today's plan (week tab only).
  const copyMoves: BoardMove[] =
    tab === 'week' && day !== today ? copyPlan(boards[today] ?? EMPTY_DAY, board, agents, day) : []

  function clearBoard() {
    if (tab === 'today' && !window.confirm("Send everyone on today's board back to the bench?")) return
    void commit(
      clearIds.map((userId) => ({ userId, date: day, from: queueNow(userId, day), queue: null })),
      { reason: 'Cleared board', toast: `Cleared ${clearIds.length} agents` },
    )
  }

  function copyToday() {
    // Rebuilt from the latest board (including still-saving moves) so every
    // `from` is current.
    const b = boardsRef.current
    const moves = copyPlan(b[today] ?? EMPTY_DAY, b[day] ?? EMPTY_DAY, agents, day)
    void commit(moves, { reason: "Copied from today's plan", toast: `Copied today's plan to ${weekdayName(day)}` })
  }

  // Single entry point for drag-end and click-to-place: a card id (main or
  // additional) and a lane, or null for the bench.
  const requestMove = useCallback(
    (id: string, target: string | null) => {
      const { agentId } = parseCardId(id)
      if (!agentsById.has(agentId) || !canEdit) return
      const plan = planMove(boardsRef.current[day] ?? EMPTY_DAY, id, target)
      if (plan.kind === 'none') return
      if (plan.kind === 'choose') setMoveOrAdd({ agentId, from: plan.from, to: plan.to })
      else if (plan.kind === 'additional') saveAdditional(agentId, plan.from, plan.to)
      else saveMove(agentId, plan.from, plan.to)
    },
    [agentsById, canEdit, day, saveAdditional, saveMove],
  )

  function moveHere() {
    if (!moveOrAdd) return
    const { agentId, from, to } = moveOrAdd
    setMoveOrAdd(null)
    // Only same-day lane-to-lane moves ask why; the week tab can have
    // day === today, so check the tab, not the date.
    if (tab === 'today') setAskReason({ agentId, from, to })
    else saveMove(agentId, from, to)
  }

  function addHere() {
    if (!moveOrAdd) return
    setMoveOrAdd(null)
    saveAdditional(moveOrAdd.agentId, null, moveOrAdd.to)
  }

  // The card being dragged, shown in the DragOverlay.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragging = draggingId ? parseCardId(draggingId) : null
  const draggingAgent = dragging ? agentsById.get(dragging.agentId) : undefined

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDraggingId(null)
    if (!over) return
    const id = String(over.id)
    if (id === 'bench') requestMove(String(active.id), null)
    else if (id.startsWith('lane:')) requestMove(String(active.id), id.slice('lane:'.length))
  }

  const nameOf = (id: string | number) => agentsById.get(parseCardId(String(id)).agentId)?.full_name ?? 'agent'
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}`,
    onDragOver: ({ over }) => {
      if (!over) return undefined
      const id = String(over.id)
      return id === 'bench' ? 'Over the bench' : `Over ${queueOptionLabel(id.replace(/^lane:/, ''))}`
    },
    onDragEnd: ({ active, over }) => {
      const name = nameOf(active.id)
      if (!over) return `Cancelled moving ${name}`
      const id = String(over.id)
      const target = id === 'bench' ? null : id.replace(/^lane:/, '')
      // Same rules as requestMove.
      const plan: MovePlan = canEdit ? planMove(board, String(active.id), target) : { kind: 'none' }
      if (plan.kind === 'none') return `${name} was not moved`
      if (plan.kind === 'choose') {
        const where = queueOptionLabel(plan.to)
        return `Choose whether to move ${name} to ${where} or add ${where} as an additional platform`
      }
      if (plan.kind === 'additional') return additionalMessage(name, plan.from, plan.to)
      return plan.to === null ? `Sent ${name} to the bench` : `Moved ${name} to ${queueOptionLabel(plan.to)}`
    },
    onDragCancel: ({ active }) => `Cancelled moving ${nameOf(active.id)}`,
  }

  const toggleSelect = (id: string) => setSelectedId((cur) => (cur === id ? null : id))

  const stats = coverage(board, agents)
  const counts = laneCounts(board)
  // The bench holds agents with no main lane and no additionals; everyone
  // else shows as one card per lane they cover.
  const benchAgents: { agent: BoardAgent; note: string | null }[] = []
  const byQueue: Record<string, { agent: BoardAgent; additional: boolean }[]> = {}
  for (const a of agents) {
    const { main, additional } = agentLanes(board, a.id)
    if (main) (byQueue[main] ??= []).push({ agent: a, additional: false })
    for (const lane of additional) (byQueue[lane] ??= []).push({ agent: a, additional: true })
    if (!main && additional.length === 0) {
      const label = removedMainLabel(board, a.id)
      benchAgents.push({ agent: a, note: label ? `on ${label}` : null })
    }
  }
  const placedCounts = Object.fromEntries(weekDays.map((d) => [d, coverage(boards[d] ?? EMPTY_DAY, agents).onQueue]))

  const selected = selectedId ? parseCardId(selectedId) : null
  const selectedAgent = selected ? agentsById.get(selected.agentId) ?? null : null
  const selectedOnBench =
    selected !== null && selected.additionalLane === null && benchAgents.some((b) => b.agent.id === selected.agentId)

  function switchTab(next: Tab) {
    setTab(next)
    setSelectedId(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Tickets · Queue Assignment
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Queue Board</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {canEdit
              ? 'Drag agents between the bench and the queues, or select a card and choose a lane.'
              : 'You can view the board. Only team leaders and above can move agents.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => switchTab(t.key)}
              className={`min-h-11 rounded-xl px-4 text-sm font-medium ${
                tab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'history' ? (
        <HistoryList agents={agents} />
      ) : (
        <>
          <CoverageBar
            stats={stats}
            actions={
              canEdit && (
                <BoardActions
                  showCopy={tab === 'week'}
                  canAutoFill={autoPlan.length > 0}
                  canClear={clearIds.length > 0}
                  canCopy={copyMoves.length > 0}
                  onAutoFill={() => setConfirmAutoFill(true)}
                  onClear={clearBoard}
                  onCopy={copyToday}
                />
              )
            }
          />

          {stats.covered === stats.total && (
            <p className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
              Every queue is covered. Nice work, captain.
            </p>
          )}

          {tab === 'week' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous week"
                  onClick={() => router.push('?week=' + addDays(weekStart, -7))}
                  className="min-h-11 min-w-11 rounded-xl border border-gray-200 bg-white text-lg text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  ‹
                </button>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Week of {formatDayMonth(weekStart)}
                </span>
                <button
                  type="button"
                  aria-label="Next week"
                  onClick={() => router.push('?week=' + addDays(weekStart, 7))}
                  className="min-h-11 min-w-11 rounded-xl border border-gray-200 bg-white text-lg text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  ›
                </button>
              </div>
              <DayPicker
                days={weekDays}
                selected={weekDay}
                placedCounts={placedCounts}
                onSelect={(d) => {
                  setWeekDay(d)
                  setSelectedId(null)
                }}
              />
            </div>
          )}

          <DndContext
            id="queue-board"
            sensors={sensors}
            onDragStart={({ active }) => setDraggingId(String(active.id))}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDraggingId(null)}
            accessibility={{ announcements, screenReaderInstructions: { draggable: KEYBOARD_HINT } }}
          >
            <div className="grid items-start gap-6 min-[900px]:grid-cols-[280px_1fr]">
              <Bench
                agents={benchAgents}
                selectedAgent={selectedAgent}
                selectedCardId={selectedId}
                selectedOnBench={selectedOnBench}
                canEdit={canEdit}
                onSelect={toggleSelect}
                onSendToBench={() => selectedId && requestMove(selectedId, null)}
              />
              <div className="flex flex-col gap-6">
                {QUEUE_GROUPS.map((group) => {
                  const covered = group.queues.filter((q) => counts[q] >= targetFor(q)).length
                  return (
                    <div key={group.key} className="flex flex-col gap-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{group.label}</h2>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {covered} of {group.queues.length} covered
                        </span>
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
                        {group.queues.map((queue) => (
                          <QueueLane
                            key={queue}
                            queue={queue}
                            agents={byQueue[queue] ?? []}
                            selectedAgent={selectedAgent}
                            selectedCardId={selectedId}
                            canEdit={canEdit}
                            onSelect={toggleSelect}
                            onPlace={(q) => selectedId && requestMove(selectedId, q)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <DragOverlay>
              {draggingAgent && <AgentCardOverlay agent={draggingAgent} additional={dragging?.additionalLane != null} />}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {/* Before ReasonDialog: "Move here" closes this dialog and opens that
          one in the same render, and this one must hand focus back first. */}
      <MoveOrAddDialog
        open={moveOrAdd !== null}
        agentName={moveOrAdd ? nameOf(moveOrAdd.agentId) : ''}
        to={moveOrAdd ? queueOptionLabel(moveOrAdd.to) : ''}
        canAdd={!!moveOrAdd && (board.additional[moveOrAdd.agentId] ?? []).length < MAX_ADDITIONAL_QUEUES}
        onMove={moveHere}
        onAdd={addHere}
        onCancel={() => setMoveOrAdd(null)}
      />

      <ReasonDialog
        open={askReason !== null}
        agentName={askReason ? nameOf(askReason.agentId) : ''}
        from={askReason ? queueOptionLabel(askReason.from) : ''}
        to={askReason ? queueOptionLabel(askReason.to) : ''}
        onCancel={() => setAskReason(null)}
        onConfirm={(reason) => {
          if (askReason) saveMove(askReason.agentId, askReason.from, askReason.to, reason ?? undefined)
          setAskReason(null)
        }}
      />

      <AutoFillDialog
        open={confirmAutoFill}
        rows={autoPlan.map((p) => ({ userId: p.userId, name: nameOf(p.userId), queue: queueOptionLabel(p.queue) }))}
        onCancel={() => setConfirmAutoFill(false)}
        onConfirm={() => {
          setConfirmAutoFill(false)
          if (autoPlan.length === 0) return
          void commit(
            // Auto-fill only places bench agents, so every move is from the bench.
            autoPlan.map((p) => ({ userId: p.userId, date: day, from: null, queue: p.queue })),
            { reason: 'Auto-fill', toast: `Auto-filled ${autoPlan.length} spots` },
          )
        }}
      />

      <BoardToast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
