import { Profile, TeamGroup } from '@/types'

type GroupableProfile = Pick<Profile, 'id' | 'full_name' | 'is_active' | 'role' | 't2_team'>

/** Roster's display-level team grouping — derived from profiles.t2_team, not the legacy teams table. */
export function getTeamGroup(t2Team: string | null | undefined): 'social' | 't2' {
  return t2Team ? 't2' : 'social'
}

/**
 * Buckets every active agent into Social/T2. T2 membership is still by
 * profiles.t2_team, but Social additionally requires an actual
 * team_members row - an agent with neither shouldn't appear on the
 * roster at all (2026-09-18: previously any non-T2 agent landed in
 * Social by default, including ones with no team assigned, showing "No
 * Rotation" for their shift data instead of being excluded).
 */
export function buildTeamGroupRoster(
  profiles: GroupableProfile[],
  memberProfileIds: ReadonlySet<string>,
): { social: GroupableProfile[]; t2: GroupableProfile[] } {
  const social = profiles.filter(p => p.role === 'agent' && p.is_active && !p.t2_team && memberProfileIds.has(p.id))
  const t2 = profiles.filter(p => p.role === 'agent' && p.is_active && !!p.t2_team)
  return { social, t2 }
}

/** Colors a shift/team element by the group(s) of the agents assigned to it — 'mixed' if they span both. */
export function getGroupColorKey(groups: TeamGroup[]): TeamGroup {
  const unique = new Set(groups)
  if (unique.size === 0) return 'social'
  if (unique.size > 1) return 'mixed'
  return [...unique][0]
}
