'use client'

import { useDroppable } from '@dnd-kit/core'
import { Plus, Crown, UserPlus, Pencil, Trash2 } from 'lucide-react'
import { TeamBoardColumn, Profile, Team } from '@/types'
import PersonCard from './PersonCard'
import { teamColorClasses } from '@/lib/roster/teamColors'
import { PresenceInfo } from '@/lib/roster/presence'

type PersonLite = Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'department' | 'is_active'>

interface Props {
  column: TeamBoardColumn
  currentUserId: string
  /** team_leader, admin, or management — can move/remove a plain team
   *  member, and open Edit Person (limited to editing email there — see
   *  EditPersonModal's canEditRoleAndDept). */
  canManageMembers: boolean
  /** admin or management only — can touch a team_leaders row, additionally
   *  edit name/department/role in Edit Person, or manage teams/profiles. */
  canManageLeaders: boolean
  onEdit: (person: PersonLite) => void
  onRemove: (personId: string, teamId: string, isLeader: boolean) => void
  onAdd: (teamId: string) => void
  onAddLeader: (teamId: string) => void
  onRenameTeam: (team: Team) => void
  onDeleteTeam: (team: Team) => void
  onAssignShift?: (personId: string, fullName: string) => void
  onToggleActive?: (personId: string, isActive: boolean) => void
  /** team_leader-tier callers only see this for an agent card — admin/management/hod see it everywhere. */
  onDeleteAccount?: (personId: string) => void
  presenceMap: Map<string, PresenceInfo>
}

export default function TeamColumn({ column, currentUserId, canManageMembers, canManageLeaders, onEdit, onRemove, onAdd, onAddLeader, onRenameTeam, onDeleteTeam, onAssignShift, onToggleActive, onDeleteAccount, presenceMap }: Props) {
  const { team, leader, members } = column
  const c = teamColorClasses[team.color]

  const { setNodeRef: setLeaderRef, isOver: isLeaderOver } = useDroppable({ id: `leader:${team.id}`, disabled: !canManageLeaders })
  const { setNodeRef: setMembersRef, isOver: isMembersOver } = useDroppable({ id: `members:${team.id}`, disabled: !canManageMembers })

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col">
      <div className={`px-4 py-3 rounded-t-xl border-b flex items-center justify-between gap-2 ${c.border} ${c.lightBg}`}>
        <p className={`font-semibold text-sm truncate ${c.text}`}>{team.name}</p>
        {canManageLeaders && (
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => onRenameTeam(team)} className={`opacity-60 hover:opacity-100 ${c.text}`} title="Rename team">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => onDeleteTeam(team)} className="opacity-60 hover:opacity-100 hover:text-red-600" title="Delete team">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Crown className="w-3 h-3" /> Leader
          </p>
          {canManageLeaders && (
            <button type="button" onClick={() => onAddLeader(team.id)} className="text-gray-400 hover:text-purple-600" title="Assign team leader">
              <UserPlus className="w-4 h-4" />
            </button>
          )}
        </div>
        <div
          ref={setLeaderRef}
          className={`min-h-13 rounded-lg border-2 border-dashed p-1 transition-colors ${
            isLeaderOver ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          {leader ? (
            <PersonCard
              person={leader}
              isLeader
              dragDisabled={!canManageLeaders}
              onEdit={canManageMembers ? onEdit : undefined}
              onRemove={canManageLeaders ? id => onRemove(id, team.id, true) : undefined}
              onAssignShift={leader.id === currentUserId ? undefined : onAssignShift}
              onToggleActive={leader.id === currentUserId ? undefined : onToggleActive}
              onDeleteAccount={leader.id === currentUserId || (!canManageLeaders && leader.role !== 'agent') ? undefined : onDeleteAccount}
              presence={presenceMap.get(leader.id)}
            />
          ) : (
            <p className="text-xs text-gray-400 text-center py-3">Drop someone here to lead this team</p>
          )}
        </div>
      </div>

      <div className="px-3 pb-3 flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Members ({members.length})</p>
          {canManageLeaders && (
            <button type="button" onClick={() => onAdd(team.id)} className="text-gray-400 hover:text-blue-600">
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        <div
          ref={setMembersRef}
          className={`min-h-20 rounded-lg border-2 border-dashed p-1 space-y-1.5 transition-colors ${
            isMembersOver ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          {members.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">No members</p>
          ) : (
            members.map(m => (
              <PersonCard
                key={m.id}
                person={m}
                isLeader={false}
                dragDisabled={!canManageMembers}
                onEdit={canManageMembers ? onEdit : undefined}
                onRemove={canManageMembers ? id => onRemove(id, team.id, false) : undefined}
                onAssignShift={m.id === currentUserId ? undefined : onAssignShift}
                onToggleActive={m.id === currentUserId ? undefined : onToggleActive}
                onDeleteAccount={m.id === currentUserId || (!canManageLeaders && m.role !== 'agent') ? undefined : onDeleteAccount}
                presence={presenceMap.get(m.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
