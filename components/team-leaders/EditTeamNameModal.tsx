'use client'

import { useState } from 'react'
import { renameTeam } from '@/app/(app)/team-leaders/actions'
import Modal from '@/components/ui/Modal'
import { Team } from '@/types'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const INPUT_CLS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'

interface Props {
  team: Team | null
  onClose: () => void
  onSuccess: () => void
}

export default function EditTeamNameModal({ team, onClose, onSuccess }: Props) {
  const [name, setName] = useState(team?.name ?? '')
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, clearFieldError, clearAll, applyActionError } = useFormErrors<'name'>(['name'])

  if (!team) return null
  const currentTeam = team

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    clearAll()

    const result = await renameTeam(currentTeam.id, name.trim())

    setSaving(false)
    if ('error' in result) { applyActionError(result); return }
    onSuccess()
  }

  return (
    <Modal open={!!team} onClose={onClose} title="Rename Team">
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Team name</label>
          <input
            id="edit-team-name" required
            value={name}
            onChange={e => { setName(e.target.value); clearFieldError('name') }}
            className={fieldInputClass(INPUT_CLS, !!fieldErrors.name)} {...fieldA11y('edit-team-name', fieldErrors.name)}
          />
          <FieldError id="edit-team-name" message={fieldErrors.name} />
        </div>
        <FormErrorBanner message={formError} />
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
