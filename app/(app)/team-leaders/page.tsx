import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { fetchTodayPresence } from '@/lib/roster/fetchTodayPresence'
import { buildPersonalPatternsMap } from '@/lib/roster/resolveShift'
import { canAccessTeamManagement, canAdministerTeamManagement, isAdminOrManagement, Role } from '@/lib/auth/authz'
import Header from '@/components/layout/Header'
import TeamLeadersBoard from '@/components/team-leaders/TeamLeadersBoard'
import { Team, TeamMember, TeamLeader, Profile, ShiftTemplate, RosterRotationPattern } from '@/types'

export default async function TeamLeadersPage() {
  const userId = await getCurrentUserId()

  const [teams, teamMembers, teamLeaders, allProfiles, viewerRows, shiftTemplates, patterns] = await Promise.all([
    sql<Team[]>`SELECT * FROM teams ORDER BY name`,
    // Flat fetch, no embed — joined client-side against allProfiles below,
    // matching this codebase's established pattern for admin-style pages
    // that resolve foreign keys in the client component rather than via
    // an embedded select.
    sql<TeamMember[]>`SELECT * FROM team_members`,
    sql<TeamLeader[]>`SELECT * FROM team_leaders`,
    // Fetch everyone, not just active people — inactive members/leaders still
    // need to resolve and render (greyed out) in their team column. The Add
    // flow filters to is_active itself when computing the unassigned pool.
    sql<Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'department' | 'is_active' | 'rotation_pattern_id'>[]>`
      SELECT id, full_name, email, role, department, is_active, rotation_pattern_id FROM profiles
    `,
    // layout.tsx already gates on this, but page.tsx is a separate server
    // component render and can't receive layout's query result as a prop —
    // re-fetch here, matching the codebase's pattern of each server
    // component independently resolving its own auth-relevant data.
    sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`,
    // For the "Assign Shift" clock-icon action (canManageLeaders-gated) —
    // previously only fetched by the now-removed /admin/agents page.
    sql<ShiftTemplate[]>`SELECT * FROM shift_templates ORDER BY name`,
    // A team leader's own personal rotation resolves via Profile.rotation_pattern_id
    // (see resolveShift.ts) — needed for their presence indicator below.
    sql<RosterRotationPattern[]>`SELECT * FROM roster_rotation_patterns ORDER BY code`,
  ])

  const viewerRole = viewerRows[0]?.role ?? 'agent'
  const canManageMembers = canAccessTeamManagement(viewerRole)
  const canManageLeaders = canAdministerTeamManagement(viewerRole)
  // Assign Shift writes roster_overrides — admin/management/hod only
  // (assignShiftOverridesAction), so not qa_analyst despite canManageLeaders.
  const canAssignShift = isAdminOrManagement(viewerRole)

  const personalPatterns = buildPersonalPatternsMap(allProfiles ?? [], patterns ?? [])
  const presenceMap = await fetchTodayPresence(allProfiles ?? [], teamMembers ?? [], personalPatterns)

  return (
    <div>
      <Header title="Team Management" userId={userId!} />
      <div className="p-6">
        <TeamLeadersBoard
          teams={teams || []}
          teamMembers={teamMembers || []}
          teamLeaders={teamLeaders || []}
          allProfiles={allProfiles || []}
          currentUserId={userId!}
          canManageMembers={canManageMembers}
          canManageLeaders={canManageLeaders}
          canAssignShift={canAssignShift}
          shiftTemplates={shiftTemplates || []}
          presenceMap={presenceMap}
        />
      </div>
    </div>
  )
}
