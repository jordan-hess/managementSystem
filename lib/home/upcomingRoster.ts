import { sql } from '@/lib/db/pool'
import { resolveShift } from '@/lib/roster/resolveShift'
import { formatDateKey, getBusinessToday, getISOWeekStart } from '@/lib/roster/calendarUtils'
import { ResolvedDaySlot, TeamMember, TeamRotation, AttendanceRecord, RosterOverride } from '@/types'

const DAYS_TO_SCAN = 14

/**
 * Resolves the agent's shifts from today through their next scheduled day off
 * (inclusive), capped at DAYS_TO_SCAN in case no off day is configured within
 * that window.
 *
 * team_members/team_rotations/shift_templates/attendance_records/
 * roster_overrides are all unrestricted-read for authenticated users (see
 * Database/roster-schema.sql) — no per-row scoping needed beyond the
 * profile_id/team_id filters this query already applies.
 */
export async function getUpcomingRosterDays(
  userId: string,
): Promise<ResolvedDaySlot[]> {
  const [membership] = await sql<TeamMember[]>`
    SELECT id, team_id, profile_id, joined_at FROM team_members WHERE profile_id = ${userId}
  `

  if (!membership) return []

  const today = getBusinessToday()
  const scanDates = Array.from({ length: DAYS_TO_SCAN }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  })
  const weekStarts = [...new Set(scanDates.map(d => formatDateKey(getISOWeekStart(d))))]
  const rangeStart = formatDateKey(today)
  const rangeEnd = formatDateKey(scanDates[scanDates.length - 1])

  const [rotations, attendanceRecords, overrides] = await Promise.all([
    sql<TeamRotation[]>`
      SELECT tr.*, to_jsonb(st.*) AS shift_templates
      FROM team_rotations tr
      JOIN shift_templates st ON st.id = tr.shift_template_id
      WHERE tr.team_id = ${membership.team_id} AND tr.week_start_date = ANY(${weekStarts})
    `,
    sql<AttendanceRecord[]>`
      SELECT * FROM attendance_records
      WHERE profile_id = ${userId} AND date >= ${rangeStart} AND date <= ${rangeEnd}
    `,
    sql<RosterOverride[]>`
      SELECT ro.*,
        CASE WHEN st.id IS NULL THEN NULL ELSE to_jsonb(st.*) END AS shift_templates
      FROM roster_overrides ro
      LEFT JOIN shift_templates st ON st.id = ro.shift_template_id
      WHERE ro.profile_id = ${userId} AND ro.date >= ${rangeStart} AND ro.date <= ${rangeEnd}
    `,
  ])

  const teamMembers: TeamMember[] = [membership]
  const days: ResolvedDaySlot[] = []

  for (const date of scanDates) {
    const slot = resolveShift(userId, date, teamMembers, rotations, attendanceRecords, overrides)
    days.push(slot)
    if (slot.effectiveStatus === 'off') break
  }

  return days
}
