import { sql } from '@/lib/db/pool'
import { resolveShift, buildTeamPatternsMap, buildPersonalPatternsMap } from './resolveShift'
import { formatDateKey, getISOWeekStart, getBusinessToday } from './calendarUtils'
import { Team, TeamMember, TeamRotation, AttendanceRecord, RosterOverride, RosterRotationPattern, ResolvedDaySlot } from '@/types'

/**
 * Which of the given profiles resolve to an 'off' day on `date` — the same
 * resolveShift/buildSlotMap machinery RosterManager.tsx uses for the full
 * roster grid, scoped down to only the profiles + single date the caller
 * actually needs (see lib/roster/resolveShift.ts's contract: every lookup
 * inside it is a .find()/.filter() against profile_id/team_id/date, so a
 * pre-scoped fetch is safe and doesn't need the full roster page's data).
 *
 * Used by the escalation/follow-up "assignee off tomorrow" alert
 * (app/(app)/admin/escalations/actions.ts, app/(app)/support-tickets/actions.ts)
 * and the live indicator on the Workflows page.
 */
export async function getAgentsOffOnDate(profileIds: string[], date: Date): Promise<Set<string>> {
  const slots = await resolveSlotsForDate(profileIds, date)
  const off = new Set<string>()
  for (const [profileId, slot] of slots) {
    if (slot.effectiveStatus === 'off') off.add(profileId)
  }
  return off
}

/**
 * Every given profile's resolved roster slot for `date` (a business-local Date,
 * the kind getBusinessToday() returns). The shared fetch behind
 * getAgentsOffOnDate and lib/roster/onShift.ts — one copy of the data loading,
 * so the two cannot drift apart.
 */
export async function resolveSlotsForDate(profileIds: string[], date: Date): Promise<Map<string, ResolvedDaySlot>> {
  const slots = new Map<string, ResolvedDaySlot>()
  if (profileIds.length === 0) return slots

  const dateStr = formatDateKey(date)
  const weekStart = formatDateKey(getISOWeekStart(date))

  const [teamMembers, attendanceRecords, overrides, teams, patterns, profiles] = await Promise.all([
    sql<TeamMember[]>`SELECT * FROM team_members WHERE profile_id = ANY(${profileIds})`,
    sql<AttendanceRecord[]>`SELECT * FROM attendance_records WHERE date = ${dateStr} AND profile_id = ANY(${profileIds})`,
    sql<RosterOverride[]>`
      SELECT ro.*,
        CASE WHEN st.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time
        ) END AS shift_templates
      FROM roster_overrides ro
      LEFT JOIN shift_templates st ON st.id = ro.shift_template_id
      WHERE ro.date = ${dateStr} AND ro.profile_id = ANY(${profileIds})
    `,
    // Small, unfiltered tables (a handful of teams/patterns org-wide) —
    // matching app/(app)/roster/page.tsx's own "just fetch all of it" pattern
    // rather than narrowing further for marginal savings.
    sql<Team[]>`SELECT * FROM teams`,
    sql<RosterRotationPattern[]>`SELECT * FROM roster_rotation_patterns`,
    sql<{ id: string; rotation_pattern_id: string | null }[]>`
      SELECT id, rotation_pattern_id FROM profiles WHERE id = ANY(${profileIds})
    `,
  ])

  const teamIds = [...new Set(teamMembers.map((m) => m.team_id))]
  const rotations = teamIds.length === 0 ? [] : await sql<TeamRotation[]>`
    SELECT tr.*,
      jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) AS teams,
      jsonb_build_object(
        'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time,
        'work_days', st.work_days, 'is_late_shift', st.is_late_shift
      ) AS shift_templates
    FROM team_rotations tr
    JOIN teams t ON t.id = tr.team_id
    JOIN shift_templates st ON st.id = tr.shift_template_id
    WHERE tr.team_id = ANY(${teamIds}) AND tr.week_start_date = ${weekStart}
  `

  const teamPatterns = buildTeamPatternsMap(teams, patterns)
  const personalPatterns = buildPersonalPatternsMap(profiles, patterns)

  for (const profileId of profileIds) {
    slots.set(profileId, resolveShift(profileId, date, teamMembers, rotations, attendanceRecords, overrides, teamPatterns, personalPatterns))
  }
  return slots
}

/** Tomorrow (business-timezone calendar day) relative to right now. */
export function tomorrow(): Date {
  const d = getBusinessToday()
  d.setDate(d.getDate() + 1)
  return d
}

/**
 * Escalation/follow-up "schedule conflict" alert — called right after a
 * followups row is created or (re)assigned (createEscalationAction,
 * createFollowupAction, assignFollowupAction in
 * app/(app)/support-tickets/actions.ts). If the assigned agent is scheduled
 * off tomorrow, every one of their team leaders gets a notification so they
 * can reassign it before then — not just one leader (the LIMIT 1 pattern
 * the older notify_team_leader_on_request DB trigger uses for leave
 * requests), since actionability here matters more than picking a single
 * owner. Silently no-ops if the agent isn't off tomorrow, or has no team
 * leader at all (same "no leader to tell" case that trigger already treats
 * as a no-op, not an error) — this is a convenience alert, not a hard
 * requirement, so it never blocks or fails the caller's own action.
 */
export async function notifyTeamLeadersIfOffTomorrow(
  agentId: string,
  followupId: string,
  itemLabel: string,
  queryDescription: string,
): Promise<void> {
  try {
    const off = await getAgentsOffOnDate([agentId], tomorrow())
    if (!off.has(agentId)) return

    const [leaders, agentRows] = await Promise.all([
      sql<{ profile_id: string }[]>`
        SELECT DISTINCT tl.profile_id
        FROM team_members tm
        JOIN team_leaders tl ON tl.team_id = tm.team_id
        WHERE tm.profile_id = ${agentId}
      `,
      sql<{ full_name: string }[]>`SELECT full_name FROM profiles WHERE id = ${agentId}`,
    ])
    if (leaders.length === 0) return

    const agentName = agentRows[0]?.full_name ?? 'This agent'
    const title = `${agentName} is off tomorrow — ${itemLabel} needs reassigning`
    const message = queryDescription.length > 200 ? `${queryDescription.slice(0, 200)}…` : queryDescription

    await Promise.all(
      leaders.map((l) => sql`
        INSERT INTO notifications (recipient_id, sender_id, followup_id, related_profile_id, title, message, type)
        VALUES (${l.profile_id}, ${agentId}, ${followupId}, ${agentId}, ${title}, ${message}, 'schedule_conflict')
      `),
    )
  } catch (error) {
    // Best-effort alert — never let a notification failure surface as an
    // error on the escalation/follow-up creation the caller actually cares about.
    console.error('notifyTeamLeadersIfOffTomorrow failed', error)
  }
}
