import { sql } from '@/lib/db/pool'
import { queryRequestsWithDetail } from '@/lib/db/requestsQuery'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { canViewFullRoster } from '@/lib/auth/authz'
import { redirect } from 'next/navigation'
import Header from '@/components/layout/Header'
import RosterManager from '@/components/roster/RosterManager'
import { getMonthRange, getRotationWeekRange, getBusinessToday, formatDateKey } from '@/lib/roster/calendarUtils'
import { AgentLoginLog, Role, Team, TeamMember, ShiftTemplate, TeamRotation, AttendanceRecord, RosterOverride, Profile, RosterPageData, RequestWithDetail, RosterRotationPattern, PasswordResetRequest } from '@/types'

export default async function RosterPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/home')

  const profileRows = await sql<Profile[]>`
    SELECT id, email, full_name, role, department, avatar_url, is_active, force_password_change, created_at, updated_at
    FROM profiles WHERE id = ${userId}
  `
  const profile = profileRows[0]
  if (!profile) redirect('/home')

  const isAdmin = profile.role === 'admin'
  const isManagement = profile.role === 'management' || profile.role === 'hod'
  const isTeamLeaderRole = profile.role === 'team_leader'
  // attendance_records/roster_overrides SELECT: self OR admin/management/
  // qa_analyst (view-only full roster) OR (a team_leader-role profile) their
  // own team's agents — unlike the other roster tables below, which are
  // unrestricted reads.
  const canViewAllAttendance = canViewFullRoster(profile.role)

  const now = new Date()
  const { from, to } = getMonthRange(now.getFullYear(), now.getMonth())
  const { from: weekFrom, to: weekTo } = getRotationWeekRange(now.getFullYear(), now.getMonth())
  const todayStr = formatDateKey(getBusinessToday())

  const [
    teams,
    allProfiles,
    shiftTemplates,
    rotations,
    attendanceRecords,
    overrides,
    myRequests,
    teamLeaderRows,
    loginLog,
    managementTeamLeaderRows,
    patterns,
    allAgentsForStatus,
  ] = await Promise.all([
    sql<(Team & { team_members: TeamMember[] })[]>`
      SELECT t.*, COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
            'id', tm.id, 'team_id', tm.team_id, 'profile_id', tm.profile_id, 'joined_at', tm.joined_at,
            'profiles', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'is_active', p.is_active)
          ) ORDER BY tm.joined_at)
         FROM team_members tm
         JOIN profiles p ON p.id = tm.profile_id
         WHERE tm.team_id = t.id
        ), '[]'::jsonb
      ) AS team_members
      FROM teams t
      ORDER BY t.name
    `,
    sql<(Pick<Profile, 'id' | 'full_name' | 'email' | 'is_active' | 'role' | 't2_team' | 'rotation_pattern_id' | 'department'> & { team_department: string | null })[]>`
      SELECT p.id, p.full_name, p.email, p.is_active, p.role, p.t2_team, p.rotation_pattern_id, p.department,
        (SELECT t.department FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.profile_id = p.id LIMIT 1) AS team_department
      FROM profiles p WHERE p.is_active = true ORDER BY p.full_name
    `,
    sql<ShiftTemplate[]>`SELECT * FROM shift_templates ORDER BY name`,
    sql<TeamRotation[]>`
      SELECT tr.*,
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) AS teams,
        jsonb_build_object(
          'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time,
          'work_days', st.work_days, 'is_late_shift', st.is_late_shift
        ) AS shift_templates
      FROM team_rotations tr
      JOIN teams t ON t.id = tr.team_id
      JOIN shift_templates st ON st.id = tr.shift_template_id
      WHERE tr.week_start_date >= ${weekFrom} AND tr.week_start_date <= ${weekTo}
    `,
    canViewAllAttendance
      ? sql<AttendanceRecord[]>`SELECT * FROM attendance_records WHERE date >= ${from} AND date <= ${to}`
      : isTeamLeaderRole
        ? sql<AttendanceRecord[]>`
            SELECT * FROM attendance_records WHERE date >= ${from} AND date <= ${to}
              AND (profile_id = ${userId} OR profile_id IN (
                SELECT tm.profile_id FROM team_members tm
                JOIN team_leaders tl ON tl.team_id = tm.team_id
                WHERE tl.profile_id = ${userId}
              ))
          `
        : sql<AttendanceRecord[]>`SELECT * FROM attendance_records WHERE date >= ${from} AND date <= ${to} AND profile_id = ${userId}`,
    canViewAllAttendance
      ? sql<RosterOverride[]>`
          SELECT ro.*,
            CASE WHEN st.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time
            ) END AS shift_templates
          FROM roster_overrides ro
          LEFT JOIN shift_templates st ON st.id = ro.shift_template_id
          WHERE ro.date >= ${from} AND ro.date <= ${to}
        `
      : isTeamLeaderRole
        ? sql<RosterOverride[]>`
            SELECT ro.*,
              CASE WHEN st.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time
              ) END AS shift_templates
            FROM roster_overrides ro
            LEFT JOIN shift_templates st ON st.id = ro.shift_template_id
            WHERE ro.date >= ${from} AND ro.date <= ${to}
              AND (ro.profile_id = ${userId} OR ro.profile_id IN (
                SELECT tm.profile_id FROM team_members tm
                JOIN team_leaders tl ON tl.team_id = tm.team_id
                WHERE tl.profile_id = ${userId}
              ))
          `
        : sql<RosterOverride[]>`
          SELECT ro.*,
            CASE WHEN st.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time
            ) END AS shift_templates
          FROM roster_overrides ro
          LEFT JOIN shift_templates st ON st.id = ro.shift_template_id
          WHERE ro.date >= ${from} AND ro.date <= ${to} AND ro.profile_id = ${userId}
        `,
    // Current user's own requests (requests_select branch 1: profile_id = caller)
    // — except a team_leader/admin viewer, whose own request(s) are visible
    // only to Management/HOD (see the pendingRequests fetch below and
    // canAccessRequest in actions.ts, which enforce this server-side too).
    isAdmin || isTeamLeaderRole ? Promise.resolve([]) : queryRequestsWithDetail(sql`r.profile_id = ${userId}`),
    // Team leader team IDs — for an admin or management/hod profile who also
    // leads a team (their own pending-requests "My Team" default), and for a
    // plain team_leader-role profile (also scopes the weekly attendance
    // summary + edit access to their own team's agents).
    isAdmin || isManagement || isTeamLeaderRole
      ? sql<{ team_id: string }[]>`SELECT team_id FROM team_leaders WHERE profile_id = ${userId}`
      : Promise.resolve([]),
    // Today's first-login-of-the-day per agent, for the presence indicators.
    // agent_login_log SELECT: profile_id = caller OR admin/management — matches
    // the attendance_records/roster_overrides branch above, same canViewAllAttendance gate.
    canViewAllAttendance
      ? sql<AgentLoginLog[]>`SELECT * FROM agent_login_log WHERE login_date = ${todayStr}`
      : sql<AgentLoginLog[]>`SELECT * FROM agent_login_log WHERE login_date = ${todayStr} AND profile_id = ${userId}`,
    // All team leaders org-wide, for the dedicated Team Leaders section (both
    // admin and management see it — a real team leader is almost always
    // role='admin', so admin needs this to see their own roster at all) —
    // anyone who leads a real team (team_leaders) OR has their own personal
    // rotation (rotation_pattern_id), since those are independent: a team
    // leader can lead a real team, have their own personal roster, or both
    // (most do both; a newly onboarded one may only have the latter).
    // Every QA analyst is included too, so one without a personal pattern
    // still shows up in the QA Team grid rather than vanishing.
    canViewAllAttendance
      ? sql<{ profiles: { id: string; full_name: string; is_active: boolean; role: Role } }[]>`
          SELECT jsonb_build_object('id', p.id, 'full_name', p.full_name, 'is_active', p.is_active, 'role', p.role) AS profiles
          FROM profiles p
          WHERE p.id IN (SELECT profile_id FROM team_leaders) OR p.rotation_pattern_id IS NOT NULL OR p.role = 'qa_analyst'
        `
      : Promise.resolve([]),
    // Teams on the automatic 28-day rotation resolve their schedule from
    // these instead of shift_templates/team_rotations — see
    // Team.rotation_pattern_id and lib/roster/resolveShift.ts.
    sql<RosterRotationPattern[]>`SELECT * FROM roster_rotation_patterns ORDER BY code`,
    // Every agent-role profile regardless of is_active — feeds the Active/
    // On Break/In a Meeting/Inactive summary widget (AgentStatusIndicatorBar),
    // which needs inactive agents too (unlike allProfiles above, which is
    // deliberately active-only for the rotation grid).
    isAdmin || isManagement || isTeamLeaderRole
      ? sql<Pick<Profile, 'id' | 'full_name' | 'is_active'>[]>`
          SELECT id, full_name, is_active FROM profiles WHERE role = 'agent' ORDER BY full_name
        `
      : Promise.resolve([]),
  ])

  // Pending requests split cleanly by who submitted them (canAccessRequest
  // in app/(app)/roster/actions.ts enforces the same split server-side):
  // - Agent-submitted: visible to admin/team_leader only. Management/HOD
  //   never see these — team leaders own agent requests end to end.
  // - team_leader/admin-submitted: visible to Management/HOD only, never
  //   to the submitter or any other team leader/admin, and actively
  //   notified (see notify_management_on_team_leader_request).
  // A plain agent gets none (they only ever see their own via myRequests).
  let pendingRequests: RequestWithDetail[] = []
  if (isAdmin || isManagement || isTeamLeaderRole) {
    pendingRequests = isManagement
      ? await queryRequestsWithDetail(sql`r.status = 'pending' AND p.role IN ('team_leader', 'admin')`)
      : await queryRequestsWithDetail(sql`r.status = 'pending' AND p.role NOT IN ('team_leader', 'admin')`)
  }

  // Password reset requests, scoped to match /api/admin/
  // review-password-reset's own authorization exactly (2026-09-16 audit
  // re-check + 2026-09-17 widening):
  //  - team_leader: agent/team_leader targets only (unchanged - a
  //    team-leader-level concern).
  //  - admin: agent/team_leader targets, PLUS admin/t3/qa_analyst targets
  //    reviewed as a peer.
  //  - management/hod: admin/t3/qa_analyst targets only.
  // `<> userId` excludes your own pending request from your own review
  // list in every case — nobody reviews themselves.
  let passwordResetRequests: PasswordResetRequest[] = []
  if (isAdmin || isTeamLeaderRole || isManagement) {
    const targetRoleFragment = isManagement
      ? sql`p.role IN ('admin', 't3', 'qa_analyst')`
      : isAdmin
        ? sql`p.role IN ('agent', 'team_leader', 'admin', 't3', 'qa_analyst')`
        : sql`p.role IN ('agent', 'team_leader')`

    passwordResetRequests = await sql<(PasswordResetRequest & { profiles: { full_name: string; email: string } })[]>`
      SELECT prr.*, jsonb_build_object('full_name', p.full_name, 'email', p.email) AS profiles
      FROM password_reset_requests prr
      JOIN profiles p ON p.id = prr.profile_id
      WHERE prr.status = 'pending' AND ${targetRoleFragment} AND prr.profile_id <> ${userId}
      ORDER BY prr.created_at ASC
    `
  }

  // Derive the current user's team from the team_members data
  const flatMembers: TeamMember[] = (teams ?? []).flatMap((t: Team & { team_members: TeamMember[] }) => t.team_members ?? [])
  const myMembership = flatMembers.find(m => m.profile_id === userId)
  const userTeam = myMembership
    ? (teams ?? []).find((t: Team & { team_members: TeamMember[] }) => t.id === myMembership.team_id) ?? null
    : null

  const teamLeaderTeamIds = (teamLeaderRows ?? []).map(r => r.team_id)

  // Dedupe: one profile can lead more than one team, but should only show once
  const teamLeaders = Array.from(
    new Map(
      (managementTeamLeaderRows ?? [])
        .map((r: any) => r.profiles as { id: string; full_name: string; is_active: boolean; role: Role } | null)
        .filter((p): p is { id: string; full_name: string; is_active: boolean; role: Role } => !!p && p.is_active)
        .map(p => [p.id, p]),
    ).values(),
  )

  const pageData: RosterPageData = {
    profile,
    teams: (teams ?? []) as (Team & { team_members: TeamMember[] })[],
    allProfiles: allProfiles ?? [],
    shiftTemplates: shiftTemplates ?? [],
    rotations: rotations ?? [],
    attendanceRecords: attendanceRecords ?? [],
    overrides: overrides ?? [],
    loginLog: loginLog ?? [],
    userTeam,
    myRequests: (myRequests ?? []) as RequestWithDetail[],
    pendingRequests,
    passwordResetRequests,
    teamLeaderTeamIds,
    teamLeaders,
    patterns: patterns ?? [],
    allAgentsForStatus: allAgentsForStatus ?? [],
  }

  return (
    <div className="flex-1 overflow-auto">
      <Header title="Team Roster" userId={profile.id} userRole={profile.role} />
      <div className="p-6 space-y-5">
        <RosterManager data={pageData} />
      </div>
    </div>
  )
}
