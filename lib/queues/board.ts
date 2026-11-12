// Queue Board (/tickets/queue-assignment) — pure logic only, no DB import, so
// 'use client' components can import it directly (same split as
// lib/queues/constants.ts).

import { QUEUES } from '@/lib/t2/constants'
import { TRUSTPILOT_LINKEDIN, queueOptionLabel } from '@/lib/queues/constants'
import { BILLING_AGENT_QUEUES } from '@/lib/billing/constants'
import type { Department } from '@/lib/departments'

/** agentId -> stored main queue; a missing or null entry means no main channel. */
export type BoardMap = Record<string, string | null>
/** agentId -> stored additional queues. */
export type AdditionalMap = Record<string, string[]>

export interface BoardDay {
  main: BoardMap
  additional: AdditionalMap
}

export interface BoardAgent {
  id: string
  full_name: string
  department: Department
}

export interface QueueBoardProps {
  today: string // 'YYYY-MM-DD'
  weekDays: string[] // Mon..Sun of the selected week (7)
  agents: BoardAgent[] // active agents, ordered by full_name
  boards: Record<string, BoardDay> // keyed by every date in [today, ...weekDays]
  canEdit: boolean
  initialTab: 'today' | 'week' // 'week' when ?week= is present
}

export interface QueueGroup {
  key: Department
  label: string
  queues: readonly string[]
}

// Social & channels lanes. ICASA, Reddit, freescout and whatsapp are off the
// board; TrustPilot and LinkedIn share one lane.
export const BOARD_SOCIAL_QUEUES: readonly string[] = [
  'hellopeter', 'mybroadband', 'pissedcustomer', 'ODU', 'TikTok', TRUSTPILOT_LINKEDIN, 'Sprinklr', 'Dark posts',
]

// Display order of the board's lanes.
export const QUEUE_GROUPS: QueueGroup[] = [
  { key: 'T2', label: 'T2 · Technical', queues: QUEUES },
  { key: 'Social', label: 'Social & channels', queues: BOARD_SOCIAL_QUEUES },
  { key: 'Billing', label: 'Billing', queues: BILLING_AGENT_QUEUES },
]

export const BOARD_QUEUES: string[] = QUEUE_GROUPS.flatMap((g) => [...g.queues])

// Agents wanted per queue; anything not listed needs 1.
export const QUEUE_TARGETS: Record<string, number> = { ADVANCED: 2 }

export function targetFor(queue: string): number {
  return QUEUE_TARGETS[queue] ?? 1
}

export type LaneState = 'empty' | 'short' | 'met' | 'over'

export function laneStatus(count: number, target: number): { state: LaneState; label: string } {
  if (count === 0) return { state: 'empty', label: 'Empty' }
  if (count < target) return { state: 'short', label: `Needs ${target - count}` }
  if (count === target) return { state: 'met', label: 'Covered' }
  return { state: 'over', label: `+${count - target} extra` }
}

/**
 * The board lane a stored queue value shows in: the legacy TrustPilot and
 * LinkedIn values fold into the combined lane; null for a queue no longer on
 * the board (or unknown).
 */
export function laneOf(queue: string | null | undefined): string | null {
  if (!queue) return null
  if (queue === 'TrustPilot' || queue === 'LinkedIn') return TRUSTPILOT_LINKEDIN
  return BOARD_QUEUES.includes(queue) ? queue : null
}

/**
 * Buckets assignment rows into one BoardDay per loaded date. Only rows for an
 * agent that has a card (agentIds) are kept: a non-agent who self-assigned via
 * MyQueueWidget, or a deactivated / re-roled agent, has no card, so counting
 * them would make coverage and auto-fill disagree with the lane badges.
 */
export function buildBoards(
  dates: string[],
  agentIds: string[],
  mainRows: { user_id: string; date: string; queue: string }[],
  additionalRows: { user_id: string; date: string; queue: string }[],
): Record<string, BoardDay> {
  const onBoard = new Set(agentIds)
  const boards: Record<string, BoardDay> = Object.fromEntries(dates.map((d) => [d, { main: {}, additional: {} }]))
  for (const r of mainRows) {
    if (boards[r.date] && onBoard.has(r.user_id)) boards[r.date].main[r.user_id] = r.queue
  }
  for (const r of additionalRows) {
    if (boards[r.date] && onBoard.has(r.user_id)) (boards[r.date].additional[r.user_id] ??= []).push(r.queue)
  }
  return boards
}

/**
 * An agent's lanes for the day. Removed lanes are dropped, and an additional
 * that matches the main's lane or repeats another additional is dropped, so
 * a stale duplicate never shows as a second card or a second count.
 */
export function agentLanes(day: BoardDay, agentId: string): { main: string | null; additional: string[] } {
  const main = laneOf(day.main[agentId])
  const additional: string[] = []
  for (const q of day.additional[agentId] ?? []) {
    const lane = laneOf(q)
    if (lane && lane !== main && !additional.includes(lane)) additional.push(lane)
  }
  return { main, additional }
}

/** Label of the agent's main channel when it is no longer a board lane, else null. */
export function removedMainLabel(day: BoardDay, agentId: string): string | null {
  const main = day.main[agentId]
  return main && laneOf(main) === null ? queueOptionLabel(main) : null
}

export function laneCounts(day: BoardDay): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(BOARD_QUEUES.map((q) => [q, 0]))
  const ids = new Set([...Object.keys(day.main), ...Object.keys(day.additional)])
  for (const id of ids) {
    const { main, additional } = agentLanes(day, id)
    if (main) counts[main]++
    for (const lane of additional) counts[lane]++
  }
  return counts
}

export function coverage(
  day: BoardDay,
  agents: BoardAgent[],
): { covered: number; total: number; onQueue: number; onBench: number; short: number } {
  const counts = laneCounts(day)
  const covered = BOARD_QUEUES.filter((q) => counts[q] >= targetFor(q)).length
  const onQueue = agents.filter((ag) => {
    const l = agentLanes(day, ag.id)
    return l.main || l.additional.length > 0
  }).length
  return {
    covered,
    total: BOARD_QUEUES.length,
    onQueue,
    onBench: agents.length - onQueue,
    short: BOARD_QUEUES.length - covered,
  }
}

/**
 * Fills every under-target lane from the bench, in display order. Agents are
 * considered in the order given (callers pass them sorted by full_name); for
 * each lane, bench agents from the lane's own department go first, then anyone
 * left. Each agent is used at most once.
 */
export function autoFillPlan(day: BoardDay, agents: BoardAgent[]): { userId: string; queue: string }[] {
  const counts = laneCounts(day)
  // Only agents with no main row at all: a main on a removed lane still counts as placed.
  const bench = agents.filter((ag) => !day.main[ag.id])
  const used = new Set<string>()
  const plan: { userId: string; queue: string }[] = []

  for (const group of QUEUE_GROUPS) {
    for (const queue of group.queues) {
      let need = targetFor(queue) - counts[queue]
      while (need > 0) {
        const pick =
          bench.find((ag) => !used.has(ag.id) && ag.department === group.key) ??
          bench.find((ag) => !used.has(ag.id))
        if (!pick) return plan
        used.add(pick.id)
        plan.push({ userId: pick.id, queue })
        need--
      }
    }
  }
  return plan
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export const REASON_CHIPS: readonly string[] = [
  'Ticket volume spike',
  'Covering absence',
  'Skills match',
  'Training',
  'Other',
]

const ADD_PREFIX = 'add:'

/** Drag id of a card: the agent id for a main card, add:<agent>:<lane> for an additional one. */
export function cardId(agentId: string, additionalLane?: string): string {
  return additionalLane ? `${ADD_PREFIX}${agentId}:${additionalLane}` : agentId
}

export function parseCardId(id: string): { agentId: string; additionalLane: string | null } {
  if (!id.startsWith(ADD_PREFIX)) return { agentId: id, additionalLane: null }
  const rest = id.slice(ADD_PREFIX.length)
  const sep = rest.indexOf(':')
  return { agentId: rest.slice(0, sep), additionalLane: rest.slice(sep + 1) }
}

export function queueGroupOf(queue: string): QueueGroup | undefined {
  return QUEUE_GROUPS.find((g) => g.queues.includes(queue))
}
