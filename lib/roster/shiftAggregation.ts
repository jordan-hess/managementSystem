import { Profile, ResolvedDaySlot, TeamGroup } from '@/types'
import { formatDateKey } from './calendarUtils'
import { getTeamGroup } from './teamGroups'

export interface ShiftRosterEntry {
  profileId: string
  full_name: string
  group: TeamGroup
  effectiveStatus: ResolvedDaySlot['effectiveStatus']
}

type GroupableProfile = Pick<Profile, 'id' | 'full_name' | 't2_team'>

/**
 * For every date × shift_template combination that actually has assigned
 * agents this week, lists who they are — aggregated across whichever of the
 * legacy 4 named teams currently resolve to that shift template, since
 * slotMap already flattens all profiles regardless of legacy team. Scoped
 * per exact date (not deduped across the week): a team's rotation can
 * legitimately differ weekday vs. weekend, so a shift badge on one day
 * shows that day's real assignees, not a blended weekly list.
 */
export function buildShiftRosterMap(
  profiles: GroupableProfile[],
  dates: Date[],
  slotMap: Map<string, ResolvedDaySlot>,
): Map<string, ShiftRosterEntry[]> {
  const map = new Map<string, ShiftRosterEntry[]>()

  for (const profile of profiles) {
    for (const date of dates) {
      const dateStr = formatDateKey(date)
      const slot = slotMap.get(`${profile.id}:${dateStr}`)
      if (!slot || !slot.isWorkDay || !slot.shiftTemplate) continue

      const key = `${dateStr}:${slot.shiftTemplate.id}`
      const entry: ShiftRosterEntry = {
        profileId: profile.id,
        full_name: profile.full_name,
        group: getTeamGroup(profile.t2_team),
        effectiveStatus: slot.effectiveStatus,
      }
      const existing = map.get(key)
      if (existing) existing.push(entry)
      else map.set(key, [entry])
    }
  }

  return map
}
