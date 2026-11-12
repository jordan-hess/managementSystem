import {
  TeamMember, TeamRotation, AttendanceRecord, RosterOverride,
  ShiftTemplate, ResolvedDaySlot, AttendanceStatus, OverrideType,
} from '@/types'
import { formatDateKey, getIsoDayOfWeek, getISOWeekStart } from './calendarUtils'
import { shiftForDate, RotationPattern, Shift } from './rotationEngine'

// Synthetic ShiftTemplate-shaped values for the automatic pattern-based
// path — lets every existing consumer of ResolvedDaySlot.shiftTemplate
// (name/start_time/end_time) keep working unchanged, without a real
// shift_templates row existing for a team on the automatic rotation.
const AUTO_EARLY_TEMPLATE: ShiftTemplate = {
  id: 'auto-early', name: 'Early', start_time: '08:00:00', end_time: '17:00:00',
  work_days: [1, 2, 3, 4, 5, 6, 7], description: null, is_late_shift: false,
  created_at: '', updated_at: '',
}
const AUTO_LATE_TEMPLATE: ShiftTemplate = {
  id: 'auto-late', name: 'Late', start_time: '11:00:00', end_time: '20:00:00',
  work_days: [1, 2, 3, 4, 5, 6, 7], description: null, is_late_shift: true,
  created_at: '', updated_at: '',
}

function shiftToTemplate(shift: Shift): ShiftTemplate | null {
  if (shift === 'EARLY') return AUTO_EARLY_TEMPLATE
  if (shift === 'LATE') return AUTO_LATE_TEMPLATE
  return null
}

// The override modal stores a shift_template_id, not override_shift, so a
// pattern-based person's swap_in/extra_shift has to be mapped onto
// EARLY/LATE from that template — otherwise the override is ignored and the
// cell shows a bare "On Shift". Keyed on start time rather than
// is_late_shift, which isn't set on every 11:00 template.
function overrideToShift(override: RosterOverride | undefined): Shift | null {
  if (!override) return null
  if (override.override_shift) return override.override_shift
  if (override.override_type !== 'swap_in' && override.override_type !== 'extra_shift') return null
  const template = override.shift_templates as unknown as Pick<ShiftTemplate, 'start_time'> | null | undefined
  if (!template?.start_time) return null
  return template.start_time >= '11:00' ? 'LATE' : 'EARLY'
}

/**
 * Resolution for a team on the automatic 28-day rotation
 * (Team.rotation_pattern_id set) — same precedence as the manual path
 * below (attendance > override > base rotation), same ResolvedDaySlot
 * shape, but the "base schedule" comes from shiftForDate() instead of a
 * team_rotations lookup. No month/week boundary logic anywhere: the same
 * shiftForDate() call resolves any date, in any month or year.
 */
function resolveViaPattern(
  profileId: string,
  dateStr: string,
  pattern: RotationPattern,
  attendanceRecords: AttendanceRecord[],
  overrides: RosterOverride[],
): ResolvedDaySlot {
  const baseShift = shiftForDate(pattern, dateStr)

  const override = overrides.find(o => o.profile_id === profileId && o.date === dateStr)
  const overrideType = override ? (override.override_type as OverrideType) : null
  const overrideShift = overrideToShift(override)

  const attendance = attendanceRecords.find(a => a.profile_id === profileId && a.date === dateStr)
  const attendanceStatus = attendance ? (attendance.status as AttendanceStatus) : null

  if (attendanceStatus) {
    return {
      profileId, date: dateStr, isWorkDay: true,
      shiftTemplate: shiftToTemplate(overrideShift ?? baseShift),
      overrideType, attendanceStatus, effectiveStatus: attendanceStatus,
    }
  }

  if (overrideType === 'off' || overrideShift === 'OFF') {
    return { profileId, date: dateStr, isWorkDay: false, shiftTemplate: shiftToTemplate(baseShift), overrideType, attendanceStatus: null, effectiveStatus: 'off' }
  }

  if (overrideShift) {
    return { profileId, date: dateStr, isWorkDay: true, shiftTemplate: shiftToTemplate(overrideShift), overrideType, attendanceStatus: null, effectiveStatus: 'on_shift' }
  }

  if (baseShift === 'OFF') {
    return { profileId, date: dateStr, isWorkDay: false, shiftTemplate: null, overrideType: null, attendanceStatus: null, effectiveStatus: 'off' }
  }

  return { profileId, date: dateStr, isWorkDay: true, shiftTemplate: shiftToTemplate(baseShift), overrideType: null, attendanceStatus: null, effectiveStatus: 'on_shift' }
}

export function resolveShift(
  profileId: string,
  date: Date,
  teamMembers: TeamMember[],
  rotations: TeamRotation[],
  attendanceRecords: AttendanceRecord[],
  overrides: RosterOverride[],
  /** team_id -> its rotation pattern, for teams on the automatic rotation. Omit entirely for callers that only ever deal with manually-scheduled teams — behavior is then identical to before this parameter existed. */
  teamPatterns?: Map<string, RotationPattern>,
  /** profile_id -> its own personal rotation pattern (Profile.rotation_pattern_id) — e.g. a team leader
   *  who rotates on their own schedule rather than a team's. Checked before team membership, so it
   *  works with no team_members row at all. */
  personalPatterns?: Map<string, RotationPattern>,
): ResolvedDaySlot {
  const dateStr = formatDateKey(date)

  const base: Omit<ResolvedDaySlot, 'effectiveStatus'> = {
    profileId,
    date: dateStr,
    isWorkDay: false,
    shiftTemplate: null,
    overrideType: null,
    attendanceStatus: null,
  }

  // 0. Personal rotation pattern — takes priority over team membership
  // entirely, and needs no team_members row to resolve against.
  const personalPattern = personalPatterns?.get(profileId)
  if (personalPattern) {
    return resolveViaPattern(profileId, dateStr, personalPattern, attendanceRecords, overrides)
  }

  // 1. Find agent's team membership
  const member = teamMembers.find(m => m.profile_id === profileId)
  if (!member) return { ...base, effectiveStatus: 'no_rotation' }

  // 1b. Team on the automatic rotation — resolve via the pattern engine
  // entirely, bypassing team_rotations/shift_templates for this team.
  const pattern = teamPatterns?.get(member.team_id)
  if (pattern) {
    return resolveViaPattern(profileId, dateStr, pattern, attendanceRecords, overrides)
  }

  // 2. Find all rotations for the agent's team in the ISO week containing this date.
  //    A team can have multiple rotations per week (e.g. Morning Mon–Fri + Night Sat–Sun).
  const weekStart = formatDateKey(getISOWeekStart(date))
  const weekRotations = rotations.filter(
    r => r.team_id === member.team_id && r.week_start_date === weekStart,
  )
  if (weekRotations.length === 0) return { ...base, effectiveStatus: 'no_rotation' }

  // 3. Pick the rotation whose shift template covers today's day-of-week.
  const isoDow = getIsoDayOfWeek(date)
  const rotation = weekRotations.find(r => {
    const t = r.shift_templates as ShiftTemplate | undefined
    return t && t.work_days.includes(isoDow)
  })

  // Team has rotations this week but none cover today → off day
  if (!rotation || !rotation.shift_templates) {
    return { ...base, effectiveStatus: 'off' }
  }

  const template = rotation.shift_templates as ShiftTemplate

  // 4. Check for a roster override
  const override = overrides.find(o => o.profile_id === profileId && o.date === dateStr)
  const overrideType = override ? (override.override_type as OverrideType) : null

  // 5. Check for an attendance record (highest priority)
  const attendance = attendanceRecords.find(a => a.profile_id === profileId && a.date === dateStr)
  const attendanceStatus = attendance ? (attendance.status as AttendanceStatus) : null

  if (attendanceStatus) {
    return {
      profileId, date: dateStr,
      isWorkDay: overrideType === 'swap_in' || overrideType === 'extra_shift' ? true : true,
      shiftTemplate: override?.shift_templates ? (override.shift_templates as unknown as ShiftTemplate) : template,
      overrideType,
      attendanceStatus,
      effectiveStatus: attendanceStatus,
    }
  }

  // 6. Override: forced off day
  if (overrideType === 'off') {
    return { ...base, isWorkDay: false, shiftTemplate: template, overrideType, attendanceStatus: null, effectiveStatus: 'off' }
  }

  // 7. Override: swap_in or extra_shift — use override template, treat as work day
  if (overrideType === 'swap_in' || overrideType === 'extra_shift') {
    const overrideTemplate = override?.shift_templates
      ? (override.shift_templates as unknown as ShiftTemplate)
      : template
    return {
      profileId, date: dateStr,
      isWorkDay: true,
      shiftTemplate: overrideTemplate,
      overrideType,
      attendanceStatus: null,
      effectiveStatus: 'on_shift',
    }
  }

  // 8. Scheduled work day, no attendance record yet
  return {
    profileId, date: dateStr,
    isWorkDay: true,
    shiftTemplate: template,
    overrideType: null,
    attendanceStatus: null,
    effectiveStatus: 'on_shift',
  }
}

/** Build a lookup map for an entire date range at once */
export function buildSlotMap(
  profiles: { id: string }[],
  dates: Date[],
  teamMembers: TeamMember[],
  rotations: TeamRotation[],
  attendanceRecords: AttendanceRecord[],
  overrides: RosterOverride[],
  teamPatterns?: Map<string, RotationPattern>,
  personalPatterns?: Map<string, RotationPattern>,
): Map<string, ResolvedDaySlot> {
  const notesByKey = new Map(overrides.filter(o => o.notes).map(o => [`${o.profile_id}:${o.date}`, o.notes]))
  const map = new Map<string, ResolvedDaySlot>()
  for (const profile of profiles) {
    for (const date of dates) {
      const slot = resolveShift(profile.id, date, teamMembers, rotations, attendanceRecords, overrides, teamPatterns, personalPatterns)
      const key = `${profile.id}:${slot.date}`
      map.set(key, { ...slot, overrideNotes: notesByKey.get(key) ?? null })
    }
  }
  return map
}

/** Builds the team_id -> RotationPattern map resolveShift/buildSlotMap expect, from the teams and patterns tables. */
export function buildTeamPatternsMap(
  teams: { id: string; rotation_pattern_id: string | null }[],
  patterns: { id: string; shift_sequence: Shift[]; anchor_date: string }[],
): Map<string, RotationPattern> {
  const patternsById = new Map(patterns.map(p => [p.id, { shiftSequence: p.shift_sequence, anchorDate: p.anchor_date }]))
  const map = new Map<string, RotationPattern>()
  for (const team of teams) {
    if (!team.rotation_pattern_id) continue
    const pattern = patternsById.get(team.rotation_pattern_id)
    if (pattern) map.set(team.id, pattern)
  }
  return map
}

/** Builds the profile_id -> RotationPattern map resolveShift/buildSlotMap expect, for profiles on their
 *  own personal rotation (e.g. a team leader) rather than a team's — from the profiles and patterns tables. */
export function buildPersonalPatternsMap(
  profiles: { id: string; rotation_pattern_id?: string | null }[],
  patterns: { id: string; shift_sequence: Shift[]; anchor_date: string }[],
): Map<string, RotationPattern> {
  const patternsById = new Map(patterns.map(p => [p.id, { shiftSequence: p.shift_sequence, anchorDate: p.anchor_date }]))
  const map = new Map<string, RotationPattern>()
  for (const profile of profiles) {
    if (!profile.rotation_pattern_id) continue
    const pattern = patternsById.get(profile.rotation_pattern_id)
    if (pattern) map.set(profile.id, pattern)
  }
  return map
}
