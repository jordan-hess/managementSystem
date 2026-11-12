'use server'

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { requireUser } from '@/lib/auth/requireUser'
import { AgentStatusValue, AGENT_STATUS_OPTIONS } from './constants'
import { setAgentStatusWithAudit } from './statusHistory'
import { buildSlotMap, buildTeamPatternsMap, buildPersonalPatternsMap } from '@/lib/roster/resolveShift'
import { getBusinessToday, formatDateKey, getRotationWeekRange, getBusinessMinutesOfDay } from '@/lib/roster/calendarUtils'
import type { TeamMember, TeamRotation, AttendanceRecord, RosterOverride, RosterRotationPattern, Team } from '@/types'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

const VALID_VALUES = AGENT_STATUS_OPTIONS.map((o) => o.value)

/**
 * Lazily flips a self-reported status to 'inactive' once the agent's
 * rostered shift for today has ended. There's no cron/scheduled-job
 * infrastructure in this app (see CLAUDE.md's Kubernetes section — only the
 * deploy pipeline exists), so this runs opportunistically instead, called
 * from both getMyAgentStatusAction (the /tickets page toggle, self-scoped)
 * and getAllAgentStatusesAction (the ~30s roster poll, unscoped — sweeps
 * everyone, so it also catches an agent who never reloads their own page).
 * Deliberately one-directional: only ever writes 'inactive', never 'active'
 * — a new shift starting must never auto-reactivate anyone, only an
 * explicit setMyAgentStatusAction call can.
 */
async function applyShiftEndAutoInactive(profileIds?: string[]): Promise<void> {
  const candidates = await sql<{ user_id: string }[]>`
    SELECT user_id FROM agent_status
    WHERE status != 'inactive'
    ${profileIds ? sql`AND user_id IN ${sql(profileIds)}` : sql``}
  `
  if (candidates.length === 0) return

  const today = getBusinessToday()
  const todayDateStr = formatDateKey(today)
  const { from: weekFrom, to: weekTo } = getRotationWeekRange(today.getFullYear(), today.getMonth())

  const [teamMembers, teams, rotations, attendanceRecords, overrides, patterns, patternedProfiles] = await Promise.all([
    sql<TeamMember[]>`SELECT * FROM team_members`,
    sql<Team[]>`SELECT * FROM teams`,
    sql<TeamRotation[]>`
      SELECT tr.*, jsonb_build_object(
        'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time,
        'work_days', st.work_days, 'is_late_shift', st.is_late_shift
      ) AS shift_templates
      FROM team_rotations tr
      JOIN shift_templates st ON st.id = tr.shift_template_id
      WHERE tr.week_start_date >= ${weekFrom} AND tr.week_start_date <= ${weekTo}
    `,
    sql<AttendanceRecord[]>`SELECT * FROM attendance_records WHERE date = ${todayDateStr}`,
    sql<RosterOverride[]>`SELECT * FROM roster_overrides WHERE date = ${todayDateStr}`,
    sql<RosterRotationPattern[]>`SELECT * FROM roster_rotation_patterns`,
    // Profiles on their own personal rotation (e.g. a team leader) rather
    // than a team's — see resolveShift.ts's personalPatterns lookup.
    sql<{ id: string; rotation_pattern_id: string | null }[]>`
      SELECT id, rotation_pattern_id FROM profiles WHERE rotation_pattern_id IS NOT NULL
    `,
  ])

  const teamPatterns = buildTeamPatternsMap(teams, patterns)
  const personalPatterns = buildPersonalPatternsMap(patternedProfiles, patterns)
  const slotMap = buildSlotMap(
    candidates.map((c) => ({ id: c.user_id })),
    [today], teamMembers, rotations, attendanceRecords, overrides, teamPatterns, personalPatterns,
  )

  const nowMinutes = getBusinessMinutesOfDay(new Date())
  const toDeactivate: string[] = []
  for (const { user_id } of candidates) {
    const slot = slotMap.get(`${user_id}:${todayDateStr}`)
    if (!slot?.isWorkDay || !slot.shiftTemplate) continue
    const [h, m] = slot.shiftTemplate.end_time.slice(0, 5).split(':').map(Number)
    if (nowMinutes >= h * 60 + m) toDeactivate.push(user_id)
  }

  if (toDeactivate.length > 0) {
    // System-triggered, not any one person's action - changed_by is NULL,
    // same convention queue_reassignments would use for an equivalent
    // automatic change (it has none today, but the column is nullable for
    // exactly this reason).
    await withTransaction(async (tx) => {
      for (const userId of toDeactivate) {
        await setAgentStatusWithAudit(tx as unknown as typeof sql, userId, 'inactive', null)
      }
    })
  }
}

/**
 * Self-service — any authenticated user sets their OWN current status, no
 * role gate beyond "has a session" (mirrors lib/queues/actions.ts's
 * setMyQueueAction). Every change is audit-logged to agent_status_history
 * via setAgentStatusWithAudit, the same previous/new/changed_by shape
 * queue_reassignments already uses for queue changes (2026-09-18) —
 * changed_by = the caller themselves is itself the "self-service" signal,
 * same convention as queue_reassignments.changed_by === user_id.
 */
export async function setMyAgentStatusAction(status: AgentStatusValue): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (!VALID_VALUES.includes(status)) return { error: `status must be one of: ${VALID_VALUES.join(', ')}` }

  try {
    await withTransaction((tx) => setAgentStatusWithAudit(tx as unknown as typeof sql, auth.userId, status, auth.userId))
    return { data: true }
  } catch (error) {
    console.error('setMyAgentStatusAction failed', error)
    return { error: 'Could not update your status.' }
  }
}

export async function getMyAgentStatusAction(): Promise<ActionResult<{ status: AgentStatusValue }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  try {
    await applyShiftEndAutoInactive([auth.userId])
    const [row] = await sql<{ status: AgentStatusValue }[]>`
      SELECT status FROM agent_status WHERE user_id = ${auth.userId}
    `
    return { data: { status: row?.status ?? 'active' } }
  } catch (error) {
    console.error('getMyAgentStatusAction failed', error)
    return { error: 'Could not load your status.' }
  }
}

/**
 * Unscoped read — no role gate. Matches the posture lib/roster/
 * fetchTodayPresence.ts's own comment already documents for
 * team_rotations/attendance_records/roster_overrides/agent_login_log:
 * "unrestricted-read for authenticated users." A live break/meeting flag
 * is no more sensitive than "have they logged in yet." Polled every ~30s
 * by RosterManager.tsx and TeamLeadersBoard.tsx to keep the presence dot
 * near-live.
 */
export async function getAllAgentStatusesAction(): Promise<ActionResult<{ user_id: string; status: AgentStatusValue }[]>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  try {
    await applyShiftEndAutoInactive()
    const rows = await sql<{ user_id: string; status: AgentStatusValue }[]>`
      SELECT user_id, status FROM agent_status
    `
    return { data: rows }
  } catch (error) {
    console.error('getAllAgentStatusesAction failed', error)
    return { error: 'Could not load agent statuses.' }
  }
}

// ─── agent status history (Agent: own only; Team Lead/Management: all) ──
// Mirrors lib/queues/actions.ts's getQueueHistoryAction exactly, same
// self-vs-everyone scoping rule.

export interface AgentStatusHistoryRow {
  previous_status: AgentStatusValue | null
  new_status: AgentStatusValue
  effective_at: string
  /** NULL if the account this row was about has since been hard-deleted
   *  (user_id is ON DELETE SET NULL - the row itself is kept). */
  agent_name: string | null
  changed_by_name: string | null
}

export async function getAgentStatusHistoryAction(filters: { userId?: string } = {}): Promise<ActionResult<AgentStatusHistoryRow[]>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  const scopedUserId = auth.role === 'agent' ? auth.userId : filters.userId

  try {
    const rows = await sql<AgentStatusHistoryRow[]>`
      SELECT ash.previous_status, ash.new_status, ash.effective_at,
             p.full_name AS agent_name, cb.full_name AS changed_by_name
      FROM agent_status_history ash
      LEFT JOIN profiles p ON p.id = ash.user_id
      LEFT JOIN profiles cb ON cb.id = ash.changed_by
      WHERE (${scopedUserId ?? null}::uuid IS NULL OR ash.user_id = ${scopedUserId ?? null}::uuid)
      ORDER BY ash.effective_at DESC
      LIMIT 200
    `
    return { data: rows }
  } catch (error) {
    console.error('getAgentStatusHistoryAction failed', error)
    return { error: 'Could not load status history.' }
  }
}
