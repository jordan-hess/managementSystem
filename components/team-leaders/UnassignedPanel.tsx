'use client'

import { useDroppable } from '@dnd-kit/core'
import { Profile } from '@/types'
import PersonCard from './PersonCard'
import { PresenceInfo } from '@/lib/roster/presence'

type PersonLite = Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'department' | 'is_active'>

interface Props {
  people: PersonLite[]
  currentUserId: string
  /** team_leader, admin, or management — can drag these cards into a team,
   *  drag a team member here to remove them, and open Edit Person (limited
   *  to editing email there — see EditPersonModal's canEditRoleAndDept). */
  canManageMembers: boolean
  /** admin or management only — can additionally edit name/department/role
   *  in Edit Person, assign shifts, and every other admin-tier action. */
  canManageLeaders: boolean
  onEdit: (person: PersonLite) => void
  onAssignShift?: (personId: string, fullName: string) => void
  onToggleActive?: (personId: string, isActive: boolean) => void
  /** team_leader-tier callers only see this for an agent card — admin/management/hod see it everywhere. */
  onDeleteAccount?: (personId: string) => void
  presenceMap: Map<string, PresenceInfo>
}

export default function UnassignedPanel({ people, currentUserId, canManageMembers, canManageLeaders, onEdit, onAssignShift, onToggleActive, onDeleteAccount, presenceMap }: Props) {
  // Dropping a team member here removes them from their team — a leader
  // card can't even start dragging unless canManageLeaders (see PersonCard's
  // dragDisabled), so this zone only ever needs to guard the plain-member case.
  const { setNodeRef, isOver } = useDroppable({ id: 'unassigned', disabled: !canManageMembers })

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-3 space-y-2">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Unassigned ({people.length})</p>
      <div
        ref={setNodeRef}
        className={`flex flex-wrap gap-2 rounded-lg border-2 border-dashed p-2 min-h-16 transition-colors ${
          isOver ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-transparent'
        }`}
      >
        {people.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3 w-full">
            {isOver ? 'Drop to remove from their team' : 'No unassigned people'}
          </p>
        ) : (
          people.map(p => (
            <div key={p.id} className="w-64">
              <PersonCard
                person={p}
                isLeader={false}
                dragDisabled={!canManageMembers}
                onEdit={canManageMembers ? onEdit : undefined}
                onAssignShift={p.id === currentUserId ? undefined : onAssignShift}
                onToggleActive={p.id === currentUserId ? undefined : onToggleActive}
                onDeleteAccount={p.id === currentUserId || (!canManageLeaders && p.role !== 'agent') ? undefined : onDeleteAccount}
                presence={presenceMap.get(p.id)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
