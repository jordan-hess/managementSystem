import { sql } from '@/lib/db/pool'
import { TeamMember, TeamRotation, AttendanceRecord, RosterOverride } from '@/types'
import { buildSlotMap } from './resolveShift'
import { RotationPattern } from './rotationEngine'
import { buildPresenceMap, PresenceInfo } from './presence'
import { formatDateKey, getBusinessToday, getRotationWeekRange } from './calendarUtils'

/**
 * Fetches just enough data to resolve today's presence (logged-in vs.
 * scheduled shift start) for a set of profiles — a single day/week's worth,
 * independent of whatever date range the calling page itself fetched for
 * other purposes. Used by the team management board and, separately, by
 * the roster grid (which already has this data cached and calls
 * buildPresenceMap directly instead of duplicating the fetch).
 *
 * team_rotations/attendance_records/roster_overrides/agent_login_log are all
 * unrestricted-read for authenticated users (see Database/roster-schema.sql
 * and Database/migrations/agent-login-log.sql) — no per-row scoping needed.
 */
export async function fetchTodayPresence(
  profiles: { id: string }[],
  teamMembers: TeamMember[],
  /** profile_id -> personal rotation pattern, for profiles on their own rotation (e.g. a team leader) rather than a team's — see resolveShift.ts. Omit for callers with no such profiles. */
  personalPatterns?: Map<string, RotationPattern>,
): Promise<Map<string, PresenceInfo>> {
  const today = getBusinessToday()
  const todayDateStr = formatDateKey(today)
  const { from: weekFrom, to: weekTo } = getRotationWeekRange(today.getFullYear(), today.getMonth())

  const [rotations, attendanceRecords, overrides, loginLog] = await Promise.all([
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
    sql<RosterOverride[]>`
      SELECT ro.*,
        CASE WHEN st.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time
        ) END AS shift_templates
      FROM roster_overrides ro
      LEFT JOIN shift_templates st ON st.id = ro.shift_template_id
      WHERE ro.date = ${todayDateStr}
    `,
    sql<{ profile_id: string; first_login_at: string }[]>`
      SELECT profile_id, first_login_at FROM agent_login_log WHERE login_date = ${todayDateStr}
    `,
  ])

  const slotMap = buildSlotMap(
    profiles,
    [today],
    teamMembers,
    rotations,
    attendanceRecords,
    overrides,
    undefined,
    personalPatterns,
  )

  return buildPresenceMap(profiles, slotMap, todayDateStr, loginLog, new Date())
}
