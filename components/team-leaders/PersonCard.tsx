'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Pencil, UserMinus, Clock, CheckCircle, XCircle, Trash2 } from 'lucide-react'
import { Profile } from '@/types'
import { PresenceInfo } from '@/lib/roster/presence'
import PresenceDot from '@/components/roster/PresenceDot'

type PersonLite = Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'department' | 'is_active'>

interface Props {
  person: PersonLite
  isLeader: boolean
  /** Disables drag start entirely — used when the viewer can't perform any
   *  move this card would trigger (e.g. a team_leader viewing a leader card). */
  dragDisabled?: boolean
  onEdit?: (person: PersonLite) => void
  onRemove?: (personId: string) => void
  onAssignShift?: (personId: string, fullName: string) => void
  onToggleActive?: (personId: string, isActive: boolean) => void
  onDeleteAccount?: (personId: string) => void
  presence?: PresenceInfo
}

export default function PersonCard({ person, isLeader, dragDisabled = false, onEdit, onRemove, onAssignShift, onToggleActive, onDeleteAccount, presence }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: person.id,
    data: { personId: person.id, role: person.role },
    disabled: dragDisabled,
  })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        isLeader
          ? 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20'
          : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900'
      } ${isDragging ? 'opacity-40' : ''} ${!person.is_active ? 'opacity-50' : ''}`}
    >
      <div {...listeners} {...attributes} className={`flex-1 min-w-0 ${dragDisabled ? '' : 'cursor-grab active:cursor-grabbing'}`}>
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate flex items-center gap-1.5">
          {presence && <PresenceDot info={presence} />}
          <span className="truncate">{person.full_name}</span>
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {person.department || person.role}
          {!person.is_active && ' · inactive'}
        </p>
      </div>
      {onEdit && (
        <button type="button" onClick={() => onEdit(person)} className="p-1 text-gray-400 hover:text-blue-600 shrink-0">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {onAssignShift && (
        <button type="button" onClick={() => onAssignShift(person.id, person.full_name)} className="p-1 text-gray-400 hover:text-blue-600 shrink-0" title="Assign shift">
          <Clock className="w-3.5 h-3.5" />
        </button>
      )}
      {onToggleActive && (
        <button type="button" onClick={() => onToggleActive(person.id, person.is_active)} className="p-1 text-gray-400 hover:text-red-600 shrink-0" title={person.is_active ? 'Deactivate' : 'Activate'}>
          {person.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={() => onRemove(person.id)} className="p-1 text-gray-400 hover:text-red-600 shrink-0" title="Remove from team">
          <UserMinus className="w-3.5 h-3.5" />
        </button>
      )}
      {onDeleteAccount && (
        <button type="button" onClick={() => onDeleteAccount(person.id)} className="p-1 text-gray-400 hover:text-red-600 shrink-0" title="Delete account">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
