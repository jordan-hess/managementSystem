'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import {
  moveToTeam as moveToTeamAction,
  moveToLeaderSlot as moveToLeaderSlotAction,
  removeFromTeam as removeFromTeamAction,
  deleteTeam as deleteTeamAction,
  toggleProfileActive,
  deleteUserAccount as deleteUserAccountAction,
} from '@/app/(app)/team-leaders/actions'
import { Team, TeamMember, TeamLeader, Profile, Role, TeamBoardColumn, ShiftTemplate } from '@/types'
import { PresenceInfo, mergeAgentStatusIntoPresence } from '@/lib/roster/presence'
import { getAllAgentStatusesAction } from '@/lib/agentStatus/actions'
import { AgentStatusValue } from '@/lib/agentStatus/constants'
import TeamColumn from './TeamColumn'
import EditPersonModal from './EditPersonModal'
import AddToTeamModal from './AddToTeamModal'
import AddTeamLeaderModal from './AddTeamLeaderModal'
import AddTeamModal from './AddTeamModal'
import EditTeamNameModal from './EditTeamNameModal'
import AddTeamMemberModal from './AddTeamMemberModal'
import UnassignedPanel from './UnassignedPanel'
import AssignShiftModal from '@/components/roster/admin/AssignShiftModal'

type ProfileLite = Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'department' | 'is_active'>

interface Props {
  teams: Team[]
  teamMembers: TeamMember[]
  teamLeaders: TeamLeader[]
  allProfiles: ProfileLite[]
  currentUserId: string
  /** team_leader, admin, management, or qa_analyst — can move/remove a plain team member. */
  canManageMembers: boolean
  /** admin, management, or qa_analyst — can touch a team_leaders row or
   *  manage teams/profiles (create/rename/delete team, add unassigned
   *  person, edit a person's name/department/role, and every other
   *  admin-tier board action except Assign Shift). */
  canManageLeaders: boolean
  /** admin or management only — Assign Shift writes roster_overrides. */
  canAssignShift?: boolean
  shiftTemplates?: ShiftTemplate[]
  presenceMap?: Map<string, PresenceInfo>
}

export default function TeamLeadersBoard({ teams, teamMembers, teamLeaders, allProfiles, currentUserId, canManageMembers, canManageLeaders, canAssignShift = false, shiftTemplates = [], presenceMap: serverPresenceMap = new Map() }: Props) {
  const router = useRouter()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Manually-set Active/On Break/In a Meeting status (lib/agentStatus/) —
  // polled every ~30s (matches NotificationsProvider.tsx's POLL_INTERVAL_MS
  // convention) and merged over the server-fetched presenceMap so the
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
    () => mergeAgentStatusIntoPresence(serverPresenceMap, agentStatusMap),
    [serverPresenceMap, agentStatusMap],
  )

  const [error, setError] = useState('')
  const [editingPerson, setEditingPerson] = useState<ProfileLite | null>(null)
  const [addingToTeamId, setAddingToTeamId] = useState<string | null>(null)
  const [addingLeaderToTeamId, setAddingLeaderToTeamId] = useState<string | null>(null)
  const [addingTeam, setAddingTeam] = useState(false)
  const [addingTeamMember, setAddingTeamMember] = useState(false)
  const [renamingTeam, setRenamingTeam] = useState<Team | null>(null)
  const [assignShiftPerson, setAssignShiftPerson] = useState<{ id: string; full_name: string } | null>(null)

  function findProfile(id: string) {
    return allProfiles.find(p => p.id === id)
  }

  /** Where a person currently stands, for the "drag to Unassigned" removal path. */
  function findCurrentAssignment(personId: string): { teamId: string; isLeader: boolean } | null {
    const led = teamLeaders.find(tl => tl.profile_id === personId)
    if (led) return { teamId: led.team_id, isLeader: true }
    const member = teamMembers.find(tm => tm.profile_id === personId)
    if (member) return { teamId: member.team_id, isLeader: false }
    return null
  }

  const columns: TeamBoardColumn[] = teams.map(team => {
    const leaderRow = teamLeaders.find(tl => tl.team_id === team.id)
    const leaderProfile = leaderRow ? findProfile(leaderRow.profile_id) : undefined
    const leader = leaderProfile ? { ...leaderProfile, teamLeaderRowId: leaderRow!.id } : null

    const members = teamMembers
      .filter(tm => tm.team_id === team.id && tm.profile_id !== leader?.id)
      .map(tm => findProfile(tm.profile_id))
      .filter((p): p is ProfileLite => p != null)

    return { team, leader, members }
  })

  const unassigned = allProfiles.filter(p => (canManageLeaders || p.is_active) && !teamMembers.some(tm => tm.profile_id === p.id))
  const unassignedForAdd = unassigned.filter(p => p.is_active)

  async function moveToTeam(personId: string, newTeamId: string) {
    setError('')
    const result = await moveToTeamAction(personId, newTeamId)
    if ('error' in result) { setError(result.error); return }
    router.refresh()
  }

  async function moveToLeaderSlot(personId: string, newTeamId: string, currentRole: Role) {
    setError('')
    const result = await moveToLeaderSlotAction(personId, newTeamId, currentRole)
    if ('error' in result) { setError(result.error); return }
    router.refresh()
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const data = active.data.current as { personId: string; role: Role } | undefined
    if (!data) return

    const overId = String(over.id)
    if (overId.startsWith('leader:')) {
      void moveToLeaderSlot(data.personId, overId.slice('leader:'.length), data.role)
    } else if (overId.startsWith('members:')) {
      void moveToTeam(data.personId, overId.slice('members:'.length))
    } else if (overId === 'unassigned') {
      const current = findCurrentAssignment(data.personId)
      if (current) void handleRemoveFromTeam(data.personId, current.teamId, current.isLeader)
    }
  }

  async function handleRemoveFromTeam(personId: string, teamId: string, isLeader: boolean) {
    if (!confirm('Remove this person from this team?')) return
    setError('')
    const result = await removeFromTeamAction(personId, teamId, isLeader)
    if ('error' in result) { setError(result.error); return }
    router.refresh()
  }

  async function handleDeleteTeam(team: Team) {
    if (!confirm(`Delete the "${team.name}" team? This also removes its leader and member assignments. This cannot be undone.`)) return
    setError('')
    const result = await deleteTeamAction(team.id)
    if ('error' in result) { setError(result.error); return }
    router.refresh()
  }

  async function handleToggleActive(personId: string, isActive: boolean) {
    if (isActive && !confirm('Deactivate this person? They will not be able to sign in.')) return
    setError('')
    const result = await toggleProfileActive(personId, isActive)
    if ('error' in result) { setError(result.error); return }
    router.refresh()
  }

  async function handleDeleteAccount(personId: string) {
    const name = findProfile(personId)?.full_name ?? 'this person'
    if (!confirm(`Permanently delete ${name}'s account? The account is removed from the system entirely, along with their team membership, attendance, and requests. QA reviews, tickets, and other shared history are kept and will show "Deleted user". This cannot be undone — use Deactivate if you may need the account back.`)) return
    setError('')
    const result = await deleteUserAccountAction(personId)
    if ('error' in result) { setError(result.error); return }
    router.refresh()
  }

  const onAssignShift = canAssignShift ? (id: string, fullName: string) => setAssignShiftPerson({ id, full_name: fullName }) : undefined
  // Deactivating a profile is an admin/management-tier action, same tier as
  // every other board-wide action gated on canManageLeaders.
  const onToggleActive = canManageLeaders ? handleToggleActive : undefined
  // Delete account is a team_leader-tier action (deleteUserAccount itself
  // restricts a team_leader-tier caller to agent-role targets only) —
  // canManageMembers is this file's existing team_leader-or-above boolean.
  const onDeleteAccount = canManageMembers ? handleDeleteAccount : undefined

  return (
    <DndContext id="team-leaders-board" sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{error}</p>}
        {canManageLeaders && (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddingTeamMember(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Team Member
            </button>
            <button
              type="button"
              onClick={() => setAddingTeam(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Team
            </button>
          </div>
        )}
        <UnassignedPanel
          people={unassigned}
          currentUserId={currentUserId}
          canManageMembers={canManageMembers}
          canManageLeaders={canManageLeaders}
          onEdit={setEditingPerson}
          onAssignShift={onAssignShift}
          onToggleActive={onToggleActive}
          onDeleteAccount={onDeleteAccount}
          presenceMap={presenceMap}
        />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {columns.map(column => (
            <TeamColumn
              key={column.team.id}
              column={column}
              currentUserId={currentUserId}
              canManageMembers={canManageMembers}
              canManageLeaders={canManageLeaders}
              onEdit={setEditingPerson}
              onRemove={handleRemoveFromTeam}
              onAdd={setAddingToTeamId}
              onAddLeader={setAddingLeaderToTeamId}
              onRenameTeam={setRenamingTeam}
              onDeleteTeam={handleDeleteTeam}
              onAssignShift={onAssignShift}
              onToggleActive={onToggleActive}
              onDeleteAccount={onDeleteAccount}
              presenceMap={presenceMap}
            />
          ))}
        </div>
      </div>

      <EditPersonModal
        key={editingPerson?.id ?? 'edit-modal-closed'}
        person={editingPerson}
        isCurrentlyLeading={editingPerson ? teamLeaders.some(tl => tl.profile_id === editingPerson.id) : false}
        currentUserId={currentUserId}
        canEditRoleAndDept={canManageLeaders}
        onClose={() => setEditingPerson(null)}
        onSuccess={() => { setEditingPerson(null); router.refresh() }}
      />
      <AddToTeamModal
        teamId={addingToTeamId}
        unassigned={unassignedForAdd}
        onClose={() => setAddingToTeamId(null)}
        onSuccess={() => { setAddingToTeamId(null); router.refresh() }}
      />
      <AddTeamLeaderModal
        teamId={addingLeaderToTeamId}
        candidates={allProfiles.filter(p => p.is_active)}
        onClose={() => setAddingLeaderToTeamId(null)}
        onAssign={async personId => {
          const person = findProfile(personId)
          await moveToLeaderSlot(personId, addingLeaderToTeamId!, person?.role ?? 'agent')
          setAddingLeaderToTeamId(null)
        }}
      />
      <AddTeamModal
        open={addingTeam}
        onClose={() => setAddingTeam(false)}
        onSuccess={() => { setAddingTeam(false); router.refresh() }}
      />
      <AddTeamMemberModal
        open={addingTeamMember}
        onClose={() => setAddingTeamMember(false)}
        onSuccess={() => router.refresh()}
        teams={teams.map(t => ({ id: t.id, name: t.name }))}
      />
      <EditTeamNameModal
        key={renamingTeam?.id ?? 'rename-team-modal-closed'}
        team={renamingTeam}
        onClose={() => setRenamingTeam(null)}
        onSuccess={() => { setRenamingTeam(null); router.refresh() }}
      />
      {canAssignShift && (
        <AssignShiftModal
          open={!!assignShiftPerson}
          onClose={() => setAssignShiftPerson(null)}
          onSuccess={() => { setAssignShiftPerson(null); router.refresh() }}
          profileId={assignShiftPerson?.id ?? ''}
          profileName={assignShiftPerson?.full_name ?? ''}
          shiftTemplates={shiftTemplates}
          currentUserId={currentUserId}
        />
      )}
    </DndContext>
  )
}
