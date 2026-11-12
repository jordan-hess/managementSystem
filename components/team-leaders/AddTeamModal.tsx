'use client'

import { useState } from 'react'
import { createTeam } from '@/app/(app)/team-leaders/actions'
import Modal from '@/components/ui/Modal'
import { TeamColor } from '@/types'
import { teamColorClasses } from '@/lib/roster/teamColors'
import { Plus, Loader2 } from 'lucide-react'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const INPUT_CLS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'

const COLORS: { value: TeamColor; label: string }[] = [
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'red', label: 'Red' },
  { value: 'yellow', label: 'Yellow' },
]

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddTeamModal({ open, onClose, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<TeamColor>('blue')
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, clearFieldError, clearAll, applyActionError } = useFormErrors<'name'>(['name'])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    clearAll()

    const result = await createTeam(name.trim(), color)

    setSaving(false)
    if ('error' in result) { applyActionError(result); return }
    setName('')
    setColor('blue')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Team">
      <form onSubmit={handleCreate} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Team name</label>
          <input
            id="add-team-name" required
            value={name}
            onChange={e => { setName(e.target.value); clearFieldError('name') }}
            placeholder="e.g. Alpha"
            className={fieldInputClass(INPUT_CLS, !!fieldErrors.name)} {...fieldA11y('add-team-name', fieldErrors.name)}
          />
          <FieldError id="add-team-name" message={fieldErrors.name} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Color</label>
          <div className="flex gap-2">
            {COLORS.map(c => {
              const cls = teamColorClasses[c.value]
              const selected = color === c.value
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selected
                      ? `${cls.lightBg} ${cls.text} ${cls.border}`
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${cls.dot}`} />
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>

        <FormErrorBanner message={formError} />

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {saving ? 'Creating…' : 'Create team'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
