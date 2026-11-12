/**
 * Resolves a team leader's REAL shift for a REAL date from opsHub's roster tables. Extracted from
 * resolveTeamLeaderShiftAction so the Time & Motion server actions can re-resolve the shift on the
 * server (the client's idea of the shift is never trusted). NOT a 'use server' module: it is not an
 * endpoint, and it does no authorisation — every caller must have authorised already.
 */

import { sql } from '@/lib/db/pool'
import { resolveShift, buildTeamPatternsMap, buildPersonalPatternsMap } from '@/lib/roster/resolveShift'
import { formatDateKey } from '@/lib/roster/calendarUtils'
import { mapResolvedSlotToTlShift, type ResolvedTlShift } from './rosterShiftMapping'
import type { AttendanceRecord, RosterOverride, RosterRotationPattern, Team, TeamMember } from '@/types'

export type ShiftResult = { data: ResolvedTlShift; error?: undefined } | { data?: undefined; error: string }

export async function resolveRosterShift(tlId: string, date: string): Promise<ShiftResult> {
  try {
    const dateObj = new Date(`${date}T00:00:00`)
    const dateStr = formatDateKey(dateObj)

    const [profileRows, teamMembers, attendanceRecords, overrides] = await Promise.all([
      sql<{ id: string; rotation_pattern_id: string | null }[]>`
        SELECT id, rotation_pattern_id FROM profiles WHERE id = ${tlId}
      `,
      sql<TeamMember[]>`SELECT * FROM team_members WHERE profile_id = ${tlId}`,
      sql<AttendanceRecord[]>`SELECT * FROM attendance_records WHERE profile_id = ${tlId} AND date = ${dateStr}`,
      sql<RosterOverride[]>`SELECT * FROM roster_overrides WHERE profile_id = ${tlId} AND date = ${dateStr}`,
    ])

    const profile = profileRows[0]
    if (!profile) return { error: 'Team leader profile not found' }

    const teamIds = [...new Set(teamMembers.map((m) => m.team_id))]
    const teams = teamIds.length === 0 ? [] : await sql<Team[]>`
      SELECT * FROM teams WHERE id = ANY(${teamIds})
    `

    const patternIds = [
      ...new Set([
        profile.rotation_pattern_id,
        ...teams.map((t) => t.rotation_pattern_id),
      ].filter((id): id is string => !!id)),
    ]
    const patterns = patternIds.length === 0 ? [] : await sql<RosterRotationPattern[]>`
      SELECT * FROM roster_rotation_patterns WHERE id = ANY(${patternIds})
    `

    const teamPatterns = buildTeamPatternsMap(teams, patterns)
    const personalPatterns = buildPersonalPatternsMap([profile], patterns)

    const slot = resolveShift(
      tlId, dateObj, teamMembers, /* rotations */ [], attendanceRecords, overrides,
      teamPatterns, personalPatterns,
    )

    return { data: mapResolvedSlotToTlShift(slot) }
  } catch (error) {
    console.error('resolveTeamLeaderShiftAction failed', error)
    return { error: 'Could not resolve this team leader’s shift.' }
  }
}
