'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  RosterPageData, AttendanceRecord, RosterOverride,
  TeamMember, TeamRotation,
} from '@/types'
import { buildSlotMap, buildTeamPatternsMap, buildPersonalPatternsMap } from '@/lib/roster/resolveShift'
import {
  getDaysInMonth, getMonthGridDays, formatDateKey,
  getMonthKey, getMonthKeysForDates, getBusinessToday, getWeekDays,
} from '@/lib/roster/calendarUtils'
import { buildPresenceMap, mergeAgentStatusIntoPresence } from '@/lib/roster/presence'
import { getAllAgentStatusesAction } from '@/lib/agentStatus/actions'
import { AgentStatusValue } from '@/lib/agentStatus/constants'
import { buildTeamGroupRoster } from '@/lib/roster/teamGroups'
import { buildShiftRosterMap } from '@/lib/roster/shiftAggregation'
import AgentStatusIndicatorBar from './AgentStatusIndicatorBar'
import TeamGroupBadge from './TeamGroupBadge'
import RosterWeekBoard from './RosterWeekBoard'
import WeeklyAttendanceSummary from './WeeklyAttendanceSummary'
import AgentMonthCalendar from './AgentMonthCalendar'
import RosterGridView from './RosterGridView'
import MarkAttendanceModal from './admin/MarkAttendanceModal'
import RosterOverrideModal from './admin/RosterOverrideModal'
import RequestsPanel from '@/components/requests/RequestsPanel'
import TeamRequestsModal from './admin/TeamRequestsModal'
import AdminRequestsPanel from './admin/AdminRequestsPanel'
import { Inbox, Loader2 } from 'lucide-react'

type AdminModal = 'markAttendance' | 'rosterOverride' | null

interface ModalContext {
  profileId?: string
  date?: string
  teamId?: string
}

/** Merges `incoming` rows into `existing` by id — a freshly fetched row
 *  always overwrites a stale one with the same id (e.g. a rotation whose
 *  week spans two calendar months, fetched once per month). */
function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map(item => [item.id, item]))
  for (const item of incoming) map.set(item.id, item)
  return [...map.values()]
}

interface MonthData {
  rotations: TeamRotation[]
  attendanceRecords: AttendanceRecord[]
  overrides: RosterOverride[]
}

export default function RosterManager({ data }: { data: RosterPageData }) {
  const router = useRouter()
  const { profile, teams, allProfiles, shiftTemplates, userTeam, myRequests, pendingRequests = [], passwordResetRequests = [], teamLeaderTeamIds = [], teamLeaders = [], patterns = [], allAgentsForStatus = [] } = data
  const isAdmin = profile.role === 'admin'
  const isManagement = profile.role === 'management' || profile.role === 'hod'
  const isTeamLeaderRole = profile.role === 'team_leader'
  // qa_analyst gets the same org-wide grid as admin/management, view-only:
  // no override button, no attendance marking, no override modal.
  const isQaAnalyst = profile.role === 'qa_analyst'
  // Marking attendance is management/hod, plus any admin assigned as a
  // team's leader via team_leaders (teamLeaderTeamIds is that current
  // viewer's own team_leaders rows, fetched server-side in
  // app/(app)/roster/page.tsx) — unscoped, same as management/hod, not
  // limited to that leader's own team. A bare admin with no team_leaders
  // row still can't mark attendance (requireAttendanceWriteAccess in
  // app/(app)/roster/actions.ts enforces the same rule server-side).
  // Deliberately narrower than isAdmin || isManagement, which still gates
  // viewing the grid, the Shift Rotations button, and roster overrides
  // (unaffected).
  const canMarkAttendance = isManagement || teamLeaderTeamIds.length > 0

  const [currentDate, setCurrentDate] = useState(new Date())
  const [adminModal, setAdminModal] = useState<AdminModal>(null)
  const [modalCtx, setModalCtx] = useState<ModalContext>({})
  const [requestsPanelOpen, setRequestsPanelOpen] = useState(false)

  // The server only ever sends one month's worth of roster data (see
  // app/(app)/roster/page.tsx) to keep the initial payload small. Additional
  // months are pulled in on demand as navigation reaches them, and merged
  // into this local cache — so paging around still feels instant once a
  // given month has been visited once this session.
  const [rotations, setRotations] = useState<TeamRotation[]>(() => data.rotations as TeamRotation[])
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => data.attendanceRecords)
  const [overrides, setOverrides] = useState<RosterOverride[]>(() => data.overrides)
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(
    () => new Set([getMonthKey(new Date().getFullYear(), new Date().getMonth())]),
  )
  const [loadingMonths, setLoadingMonths] = useState(false)
  const [loadError, setLoadError] = useState('')
  // Months a fetch is currently in flight for — separate from loadedMonths
  // so clicking Next repeatedly before a fetch resolves doesn't re-request
  // the same month a second time. A ref, not state: mutating it must NOT
  // trigger a re-render, since the effect below both reads and writes it —
  // if it were state and also an effect dependency, the effect's own write
  // would tear down and re-invoke itself mid-fetch, cancelling the very
  // closure waiting on that fetch's result before it could apply the data.
  const pendingMonthsRef = useRef<Set<string>>(new Set())

  // A fresh `data` object only ever arrives via router.refresh() (Server
  // Components re-render on navigation/refresh, not on client re-renders),
  // and it's always scoped to today's month — re-sync local state to match
  // whenever that happens, so writes made via the modals below are reflected
  // immediately instead of being masked by a stale merged cache. Adjusting
  // state during render (rather than in an effect) on a prop-identity
  // change is React's documented pattern for this — it resolves in the same
  // render pass instead of committing stale data first.
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setRotations(data.rotations as TeamRotation[])
    setAttendanceRecords(data.attendanceRecords)
    setOverrides(data.overrides)
    setLoadedMonths(new Set([getMonthKey(new Date().getFullYear(), new Date().getMonth())]))
  }

  // My-team/all-teams scoping now happens inside TeamRequestsBody itself
  // (shared by TeamRequestsModal and AdminRequestsPanel) — this component
  // just passes the raw unscoped set through, plus teamLeaderTeamIds so
  // that component knows what "My Team" means for the current viewer.
  const pendingCount = pendingRequests.filter(r => r.status === 'pending').length

  // Build all team_members from the nested teams structure
  const allMembers: TeamMember[] = useMemo(() =>
    teams.flatMap(t => t.team_members), [teams])

  // Teams on the automatic 28-day rotation (Team.rotation_pattern_id set) —
  // resolveShift/buildSlotMap use this to bypass team_rotations entirely
  // for those teams. Empty for a team not on the automatic rotation, which
  // keeps today's manual team_rotations behavior completely unchanged.
  const teamPatterns = useMemo(() => buildTeamPatternsMap(teams, patterns), [teams, patterns])

  // A team leader's own personal rotation (Profile.rotation_pattern_id) —
  // resolves independently of team membership; see resolveShift.ts.
  const personalPatterns = useMemo(() => buildPersonalPatternsMap(allProfiles, patterns), [allProfiles, patterns])

  // The agent-facing board is always the current week — no Month/Week/Day
  // toggle anymore (hover popovers supply the detail that used to require
  // switching views).
  const weekDates = useMemo(() => getWeekDays(getBusinessToday()), [])

  const slotMap = useMemo(() =>
    buildSlotMap(allProfiles, weekDates, allMembers, rotations as TeamRotation[], attendanceRecords, overrides, teamPatterns, personalPatterns),
    [allProfiles, weekDates, allMembers, rotations, attendanceRecords, overrides, teamPatterns, personalPatterns])

  const memberProfileIds = useMemo(() => new Set(allMembers.map(m => m.profile_id)), [allMembers])
  const agentsByGroup = useMemo(() => buildTeamGroupRoster(allProfiles, memberProfileIds), [allProfiles, memberProfileIds])

  // team_leader/admin profiles don't show up in the per-team rotation grid
  // at all (for admin or management) — they can now belong to more than
  // one team (see upsertTeamMembership in team-leaders/actions.ts). Their
  // own schedule resolves via personalPatterns below instead (no team
  // involved), and renders in management's separate "Team Leaders" section,
  // via the distinct `teamLeaders` list.
  //
  // An agent with no t2_team AND no team_members row is excluded outright
  // (2026-09-18) rather than left in - lib/departments.ts's
  // getAgentDepartment (which this grid's "Filter by team" dropdown uses)
  // defaults exactly that case to 'Social', same bug buildTeamGroupRoster
  // above already had to guard against. Filtering it out here, before
  // that shared department-bucketing function ever sees the profile,
  // fixes it for this grid without touching that function's fallback
  // behavior for its other callers (ticket list filtering, queue
  // assignment, QA reviews), which weren't part of this ask.
  // management/hod/qa_analyst don't have a shift schedule to show either
  // (2026-09-18, explicit product decision) - excluded from this grid the
  // same way team_leader/admin already were.
  const gridProfiles = useMemo(
    () => allProfiles.filter(p =>
      p.role !== 'team_leader' && p.role !== 'admin' &&
      p.role !== 'management' && p.role !== 'hod' && p.role !== 'qa_analyst' &&
      (p.role !== 'agent' || !!p.t2_team || memberProfileIds.has(p.id))
    ),
    [allProfiles, memberProfileIds],
  )

  // Team grouping for the admin/management grid: each agent under their
  // (first) team, same pick rule as the team_department subquery in
  // app/(app)/roster/page.tsx.
  const gridTeams = useMemo(
    () => teams.map(t => ({ id: t.id, name: t.name, department: t.department })),
    [teams],
  )
  const teamIdByProfile = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of allMembers) if (!map.has(m.profile_id)) map.set(m.profile_id, m.team_id)
    return map
  }, [allMembers])

  // QA analysts roster on a fixed Mon-Fri 08:00-17:00 personal pattern
  // (qa-fixed-roster-2026-10.sql), so they arrive in `teamLeaders` (anyone
  // with a personal pattern) — split out into their own "QA Team" grid.
  const leaderRoster = useMemo(() => teamLeaders.filter(p => p.role !== 'qa_analyst'), [teamLeaders])
  const qaRoster = useMemo(() => teamLeaders.filter(p => p.role === 'qa_analyst'), [teamLeaders])

  const shiftRosterMap = useMemo(() => buildShiftRosterMap(allProfiles, weekDates, slotMap), [allProfiles, weekDates, slotMap])
  const todayDateStr = useMemo(() => formatDateKey(getBusinessToday()), [])

  // Agents whose resolved schedule for today is a rostered day off (or an
  // explicit attendance override marking them off) — folded into
  // AgentStatusIndicatorBar's Inactive bucket alongside a deactivated
  // account, since slotMap (built above from the active-only allProfiles)
  // has no entry at all for an already-inactive agent in allAgentsForStatus.
  const offTodayIds = useMemo(() => {
    const ids = new Set<string>()
    for (const agent of allAgentsForStatus) {
      if (slotMap.get(`${agent.id}:${todayDateStr}`)?.effectiveStatus === 'off') ids.add(agent.id)
    }
    return ids
  }, [allAgentsForStatus, slotMap, todayDateStr])

  // Who's actually logged in today - AgentStatusIndicatorBar's Active
  // bucket requires this, not just the absence of a break/meeting/inactive
  // override (see that component's module comment).
  const loggedInIds = useMemo(() => new Set(data.loginLog.map(l => l.profile_id)), [data.loginLog])

  // Team-leader-role profiles' own team's agents, for the weekly attendance
  // summary — teams/team_members are already loaded unrestricted for
  // everyone, so no new query is needed.
  const myTeamProfiles = useMemo(() => {
    if (!isTeamLeaderRole) return []
    const myTeamIds = new Set(teamLeaderTeamIds)
    const memberIds = new Set(
      teams.filter(t => myTeamIds.has(t.id)).flatMap(t => t.team_members).map(m => m.profile_id),
    )
    return allProfiles.filter(p => memberIds.has(p.id) && p.is_active)
  }, [isTeamLeaderRole, teams, teamLeaderTeamIds, allProfiles])

  // Separate month-scoped slotMap for the admin/management grid — independent
  // of `view`/`visibleDates` above, which stay agent-facing-calendar-only.
  const gridDays = useMemo(() =>
    getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth()), [currentDate])

  const gridSlotMap = useMemo(() =>
    buildSlotMap(allProfiles, gridDays, allMembers, rotations as TeamRotation[], attendanceRecords, overrides, teamPatterns, personalPatterns),
    [allProfiles, gridDays, allMembers, rotations, attendanceRecords, overrides, teamPatterns, personalPatterns])

  // A plain agent's own month calendar — fully personal (see
  // AgentMonthCalendar.tsx), so its slot map is scoped to just their own
  // profile, but still needs the padded 42-day grid (not gridDays' exact
  // days-in-month) to render leading/trailing days from adjacent months.
  const agentMonthGridDays = useMemo(() =>
    getMonthGridDays(currentDate.getFullYear(), currentDate.getMonth()), [currentDate])

  const agentSlotMap = useMemo(() =>
    buildSlotMap([profile], agentMonthGridDays, allMembers, rotations as TeamRotation[], attendanceRecords, overrides, teamPatterns, personalPatterns),
    [profile, agentMonthGridDays, allMembers, rotations, attendanceRecords, overrides, teamPatterns, personalPatterns])

  // Presence indicators always reflect *today*, independent of whichever
  // month the grid is currently scrolled to — today's rotation data is
  // guaranteed to already be cached (the initial page load always fetches
  // it), so this needs no extra fetch beyond the login log already in data.
  const scheduleDerivedPresenceMap = useMemo(() => {
    const today = getBusinessToday()
    const todayDateStr = formatDateKey(today)
    const todaySlotMap = buildSlotMap(allProfiles, [today], allMembers, rotations as TeamRotation[], attendanceRecords, overrides, teamPatterns, personalPatterns)
    return buildPresenceMap(allProfiles, todaySlotMap, todayDateStr, data.loginLog, new Date())
  }, [allProfiles, allMembers, rotations, attendanceRecords, overrides, teamPatterns, personalPatterns, data.loginLog])

  // Manually-set Active/On Break/In a Meeting status (lib/agentStatus/) —
  // polled every ~30s (matches NotificationsProvider.tsx's POLL_INTERVAL_MS
  // convention, the app's one established "live-ish" pattern) so the
  // presence dot reflects a status change without a manual page refresh.
  const [agentStatusMap, setAgentStatusMap] = useState<Map<string, AgentStatusValue>>(new Map())
  useEffect(() => {
    let cancelled = false
    async function poll() {
      const res = await getAllAgentStatusesAction()
      if (!cancelled && res.data) setAgentStatusMap(new Map(res.data.map(r => [r.user_id, r.status])))
    }
    poll()
    const timer = setInterval(poll, 30_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const presenceMap = useMemo(
    () => mergeAgentStatusIntoPresence(scheduleDerivedPresenceMap, agentStatusMap),
    [scheduleDerivedPresenceMap, agentStatusMap],
  )

  // Every month touched by whatever's currently visible — weekDates covers
  // the team-leader board (which can spill into an adjacent month at a week
  // boundary), gridDays covers the admin/management grid, agentMonthGridDays
  // covers a plain agent's own padded month grid (always exactly
  // currentDate's month, plus whichever adjacent month(s) the padding spills
  // into). Fetch whichever of these aren't already loaded.
  const neededMonthKeys = useMemo(
    () => new Set([...getMonthKeysForDates(weekDates), ...getMonthKeysForDates(gridDays), ...getMonthKeysForDates(agentMonthGridDays)]),
    [weekDates, gridDays, agentMonthGridDays],
  )

  useEffect(() => {
    const missing = [...neededMonthKeys].filter(key => !loadedMonths.has(key) && !pendingMonthsRef.current.has(key))
    if (missing.length === 0) return

    let cancelled = false

    // Mark these months pending immediately (a ref write — see above for
    // why this must not be state) so a second Next-month click before this
    // fetch resolves doesn't fire a duplicate request for the same month.
    for (const key of missing) pendingMonthsRef.current.add(key)

    async function loadMissingMonths() {
      setLoadingMonths(true)
      setLoadError('')
      try {
        const results = await Promise.all(
          missing.map(async key => {
            const [y, m] = key.split('-').map(Number)
            const res = await fetch(`/api/roster/month-data?year=${y}&month=${m - 1}`)
            if (!res.ok) throw new Error(`Failed to load roster data for ${key}`)
            return res.json() as Promise<MonthData>
          }),
        )
        if (cancelled) return
        setRotations(prev => mergeById(prev, results.flatMap(r => r.rotations)))
        setAttendanceRecords(prev => mergeById(prev, results.flatMap(r => r.attendanceRecords)))
        setOverrides(prev => mergeById(prev, results.flatMap(r => r.overrides)))
        setLoadedMonths(prev => new Set([...prev, ...missing]))
      } catch {
        if (!cancelled) setLoadError('Could not load roster data for this period — please try again.')
      } finally {
        for (const key of missing) pendingMonthsRef.current.delete(key)
        if (!cancelled) setLoadingMonths(false)
      }
    }

    loadMissingMonths()
    return () => { cancelled = true }
  }, [neededMonthKeys, loadedMonths])

  // Build pending leave map for admin calendar indicators
  const pendingLeaveMap = useMemo((): Map<string, string[]> => {
    if (!isAdmin || !pendingRequests) return new Map()
    const map = new Map<string, string[]>()
    for (const req of pendingRequests) {
      if (req.type !== 'leave' || req.status !== 'pending') continue
      const leaveDetail = req.leave_requests?.[0]
      if (!leaveDetail) continue
      for (const d of leaveDetail.dates) {
        const existing = map.get(d) ?? []
        existing.push(req.profile_id)
        map.set(d, existing)
      }
    }
    return map
  }, [isAdmin, pendingRequests])

  // Only the admin/management grid navigates anymore (the agent-facing
  // board is a fixed current week) — always month-stepping.
  function navigate(dir: -1 | 1) {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() + dir)
      return d
    })
  }

  // Jumps straight to an arbitrary month (admin/management grid's month
  // picker) instead of stepping there one navigate() call at a time. Reuses
  // the same currentDate state the fetch-on-navigate effect already watches,
  // so landing on a not-yet-loaded month still fetches it exactly as
  // clicking Next repeatedly would.
  function jumpToMonth(date: Date) {
    setCurrentDate(date)
  }

  const openModal = useCallback((modal: AdminModal, ctx: ModalContext = {}) => {
    setModalCtx(ctx)
    setAdminModal(modal)
  }, [])

  const onOverride = isAdmin || isManagement
    ? (profileId: string, date: string) => openModal('rosterOverride', { profileId, date })
    : undefined

  function handleSuccess() {
    setAdminModal(null)
    router.refresh()
  }

  const attendanceForCtx = modalCtx.profileId && modalCtx.date
    ? attendanceRecords.find(a => a.profile_id === modalCtx.profileId && a.date === modalCtx.date) ?? null
    : null

  const overrideForCtx = modalCtx.profileId && modalCtx.date
    ? overrides.find(o => o.profile_id === modalCtx.profileId && o.date === modalCtx.date) ?? null
    : null

  const profileNameForCtx = modalCtx.profileId
    ? (allProfiles.find(p => p.id === modalCtx.profileId)?.full_name ?? '')
    : ''

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Requests button */}
        <button
          onClick={() => setRequestsPanelOpen(true)}
          className="relative flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 px-4 py-2.5 rounded-lg transition-colors ml-auto"
        >
          <Inbox className="w-4 h-4" />
          Requests
          {(isAdmin || isManagement || isTeamLeaderRole) && pendingCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-xs w-4 h-4 flex items-center justify-center rounded-full font-semibold leading-none">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>
      </div>

      {(isAdmin || isManagement || isTeamLeaderRole) && (
        <AgentStatusIndicatorBar agents={allAgentsForStatus} statusMap={agentStatusMap} offTodayIds={offTodayIds} loggedInIds={loggedInIds} />
      )}

      {loadingMonths && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading roster data…
        </div>
      )}
      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{loadError}</p>
      )}

      {isAdmin || isManagement || isQaAnalyst ? (
        <>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Team Leaders</h2>
            <RosterGridView
              currentDate={currentDate}
              onNavigate={navigate}
              onToday={() => setCurrentDate(new Date())}
              onJumpToMonth={jumpToMonth}
              allProfiles={leaderRoster}
              slotMap={gridSlotMap}
              onMarkAttendance={canMarkAttendance ? (profileId, date) => openModal('markAttendance', { profileId, date }) : undefined}
              onOverride={onOverride}
              presenceMap={presenceMap}
            />
          </div>

          <RosterGridView
            currentDate={currentDate}
            onNavigate={navigate}
            onToday={() => setCurrentDate(new Date())}
            onJumpToMonth={jumpToMonth}
            allProfiles={gridProfiles}
            slotMap={gridSlotMap}
            onMarkAttendance={canMarkAttendance ? (profileId, date) => openModal('markAttendance', { profileId, date }) : undefined}
            onOverride={onOverride}
            pendingLeaveMap={isAdmin ? pendingLeaveMap : undefined}
            presenceMap={presenceMap}
            teams={gridTeams}
            teamIdByProfile={teamIdByProfile}
          />

          {qaRoster.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">QA Team</h2>
              <RosterGridView
                currentDate={currentDate}
                onNavigate={navigate}
                onToday={() => setCurrentDate(new Date())}
                onJumpToMonth={jumpToMonth}
                allProfiles={qaRoster}
                slotMap={gridSlotMap}
                onMarkAttendance={canMarkAttendance ? (profileId, date) => openModal('markAttendance', { profileId, date }) : undefined}
                onOverride={onOverride}
                presenceMap={presenceMap}
              />
            </div>
          )}
        </>
      ) : isTeamLeaderRole ? (
        <>
          <div className="flex flex-wrap gap-3">
            <TeamGroupBadge group="social" agents={agentsByGroup.social} slotMap={slotMap} todayDateStr={todayDateStr} />
            <TeamGroupBadge group="t2" agents={agentsByGroup.t2} slotMap={slotMap} todayDateStr={todayDateStr} />
          </div>

          {/* View-only for team leaders — attendance editing stays
              admin/management-only, both here (no onCellClick) and
              server-side (requireAttendanceWriteAccess in roster/actions.ts). */}
          <WeeklyAttendanceSummary
            weekDates={weekDates}
            profiles={myTeamProfiles}
            slotMap={slotMap}
          />

          <RosterWeekBoard
            weekDates={weekDates}
            agentsByGroup={agentsByGroup}
            slotMap={slotMap}
            shiftRosterMap={shiftRosterMap}
          />
        </>
      ) : (
        // Plain agents: a fully personal month calendar — no other agents'
        // names, teams, or schedules shown at all (per explicit correction).
        <AgentMonthCalendar
          currentDate={currentDate}
          monthGridDays={agentMonthGridDays}
          profile={profile}
          slotMap={agentSlotMap}
          onNavigate={navigate}
          onToday={() => setCurrentDate(new Date())}
        />
      )}

      {/* Management: approve any request (My Team/All Teams toggle) | Admin/Team Leader: My Requests + Team Requests tabs | Agent: submission panel */}
      {isManagement ? (
        <TeamRequestsModal
          open={requestsPanelOpen}
          onClose={() => setRequestsPanelOpen(false)}
          requests={pendingRequests}
          passwordResetRequests={passwordResetRequests}
          currentUserId={profile.id}
          onRefresh={() => router.refresh()}
          teamLeaderTeamIds={teamLeaderTeamIds}
        />
      ) : isAdmin || isTeamLeaderRole ? (
        <AdminRequestsPanel
          open={requestsPanelOpen}
          onClose={() => setRequestsPanelOpen(false)}
          profile={profile}
          userTeam={userTeam}
          requests={pendingRequests}
          passwordResetRequests={passwordResetRequests}
          currentUserId={profile.id}
          onRefresh={() => router.refresh()}
          teamLeaderTeamIds={teamLeaderTeamIds}
        />
      ) : (
        <RequestsPanel
          open={requestsPanelOpen}
          onClose={() => setRequestsPanelOpen(false)}
          onSuccess={handleSuccess}
          profile={profile}
          userTeam={userTeam}
          isAdmin={false}
          myRequests={myRequests ?? []}
        />
      )}

      {/* Admin/management-only modal: roster overrides */}
      {(isAdmin || isManagement) && modalCtx.profileId && modalCtx.date && (
        <RosterOverrideModal
          open={adminModal === 'rosterOverride'}
          onClose={() => setAdminModal(null)}
          onSuccess={handleSuccess}
          profileId={modalCtx.profileId}
          profileName={profileNameForCtx}
          date={modalCtx.date}
          existing={overrideForCtx as RosterOverride | null}
          shiftTemplates={shiftTemplates}
          currentUserId={profile.id}
        />
      )}

      {/* Attendance modal: management/hod, plus any admin who leads a team
          via team_leaders (see canMarkAttendance above) — a bare admin with
          no team_leaders row still can't mark attendance (no
          onMarkAttendance passed to open this from), and team leaders have
          view-only roster access entirely (no onCellClick at all). Both are
          enforced server-side too, by requireAttendanceWriteAccess in
          app/(app)/roster/actions.ts. */}
      {canMarkAttendance && modalCtx.profileId && modalCtx.date && (
        <MarkAttendanceModal
          open={adminModal === 'markAttendance'}
          onClose={() => setAdminModal(null)}
          onSuccess={handleSuccess}
          profileId={modalCtx.profileId}
          profileName={profileNameForCtx}
          date={modalCtx.date}
          existing={attendanceForCtx as AttendanceRecord | null}
          currentOverride={overrideForCtx as RosterOverride | null}
          shiftTemplates={shiftTemplates}
          currentUserId={profile.id}
        />
      )}
    </div>
  )
}
