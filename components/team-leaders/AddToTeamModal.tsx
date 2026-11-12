'use client'

import { useState } from 'react'
import { addPersonToTeam, moveToLeaderSlot } from '@/app/(app)/team-leaders/actions'
import Modal from '@/components/ui/Modal'
import { Profile } from '@/types'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type UnassignedPerson = Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>

interface Props {
  teamId: string | null
  unassigned: UnassignedPerson[]
  onClose: () => void
  onSuccess: () => void
}

export default function AddToTeamModal({ teamId, unassigned, onClose, onSuccess }: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [makeLeader, setMakeLeader] = useState(false)
  const [saving, setSaving] = useState(false)
  const { formError, clearAll, applyActionError } = useFormErrors<never>([])

  if (!teamId) return null

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    setSaving(true)
    clearAll()

    const selectedPerson = unassigned.find(p => p.id === selectedId)
    const result = makeLeader
      ? await moveToLeaderSlot(selectedId, teamId!, selectedPerson?.role ?? 'agent')
      : await addPersonToTeam(selectedId, teamId!)

    setSaving(false)
    if ('error' in result) { applyActionError(result); return }
    setSelectedId('')
    setMakeLeader(false)
    onSuccess()
  }

  return (
    <Modal open={!!teamId} onClose={onClose} title="Add to Team">
      <form onSubmit={handleAdd} className="space-y-4">
        {unassigned.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No unassigned people available.</p>
        ) : (
          <select
            required
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Select a person…</option>
            {unassigned.map(p => (
              <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
            ))}
          </select>
        )}
        {unassigned.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={makeLeader}
              onChange={e => setMakeLeader(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-700 text-purple-600 focus:ring-purple-500"
            />
            Also make this person the team leader
          </label>
        )}
        {makeLeader && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Assigning a leader who isn&apos;t already an admin will automatically promote them to team leader.
          </p>
        )}
        <FormErrorBanner message={formError} />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button
            type="submit"
            disabled={saving || !selectedId}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors font-medium ${
              makeLeader ? 'bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
            }`}
          >
            {saving ? 'Adding...' : makeLeader ? 'Add as Team Leader' : 'Add to Team'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
