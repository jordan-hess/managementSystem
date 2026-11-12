'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { Profile } from '@/types'

type PersonLite = Pick<Profile, 'id' | 'full_name' | 'email'>

interface Props {
  teamId: string | null
  candidates: PersonLite[]
  onClose: () => void
  onAssign: (personId: string) => Promise<void>
}

export default function AddTeamLeaderModal({ teamId, candidates, onClose, onAssign }: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)

  if (!teamId) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    setSaving(true)
    await onAssign(selectedId)
    setSaving(false)
    setSelectedId('')
  }

  return (
    <Modal open={!!teamId} onClose={onClose} title="Assign Team Leader">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Assigning a leader who isn&apos;t already an admin will automatically promote them.
        </p>
        {candidates.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No one available.</p>
        ) : (
          <select
            required
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
          >
            <option value="">Select a person…</option>
            {candidates.map(p => (
              <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
            ))}
          </select>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button type="submit" disabled={saving || !selectedId} className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 rounded-lg transition-colors font-medium">
            {saving ? 'Assigning...' : 'Assign as Leader'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
