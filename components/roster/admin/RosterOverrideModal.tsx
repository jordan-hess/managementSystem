'use client'

import { useState } from 'react'
import { upsertRosterOverrideAction } from '@/app/(app)/roster/actions'
import Modal from '@/components/ui/Modal'
import { RosterOverride, ShiftTemplate, OverrideType } from '@/types'
import { Loader2 } from 'lucide-react'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

const OVERRIDE_TYPES: { value: OverrideType; label: string; description: string }[] = [
  { value: 'off',         label: 'Force Off',    description: 'Agent does not work this day regardless of schedule' },
  { value: 'swap_in',     label: 'Swap In',      description: 'Agent works a different shift on their normally-off day' },
  { value: 'extra_shift', label: 'Extra Shift',  description: 'Agent works an additional shift on top of their schedule' },
]

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  profileId: string
  profileName: string
  date: string
  existing: RosterOverride | null
  shiftTemplates: ShiftTemplate[]
  currentUserId: string
}

export default function RosterOverrideModal({ open, onClose, onSuccess, profileId, profileName, date, existing, shiftTemplates, currentUserId }: Props) {
  const [overrideType, setOverrideType] = useState<OverrideType>(existing?.override_type ?? 'off')
  const [templateId, setTemplateId] = useState(existing?.shift_template_id ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<'template'>(['template'])

  const needsTemplate = overrideType === 'swap_in' || overrideType === 'extra_shift'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    if (needsTemplate && !templateId) { setFieldErrors({ template: 'Please select a shift template for this override type.' }); return }
    setSaving(true)

    const result = await upsertRosterOverrideAction(
      profileId, date, overrideType, needsTemplate ? templateId : null, notes || null,
    )

    setSaving(false)
    if ('error' in result) { applyActionError(result); return }
    onSuccess(); onClose()
  }

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Modal open={open} onClose={onClose} title="Override Schedule">
      <div className="mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-900/40">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{profileName}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{displayDate}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className={`${labelCls} mb-2`}>Override type</label>
          <div className="space-y-2">
            {OVERRIDE_TYPES.map(({ value, label, description }) => (
              <label
                key={value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  overrideType === value
                    ? 'border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <input
                  type="radio" name="overrideType" value={value}
                  checked={overrideType === value}
                  onChange={() => { setOverrideType(value); clearFieldError('template') }}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {needsTemplate && (
          <div>
            <label className={labelCls}>Shift template to use</label>
            <select
              id="override-template" required={needsTemplate}
              value={templateId} onChange={e => { setTemplateId(e.target.value); clearFieldError('template') }}
              className={fieldInputClass(inputCls, !!fieldErrors.template)} {...fieldA11y('override-template', fieldErrors.template)}
            >
              <option value="">Select template…</option>
              {shiftTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.start_time.slice(0,5)}–{t.end_time.slice(0,5)})</option>
              ))}
            </select>
            <FieldError id="override-template" message={fieldErrors.template} />
          </div>
        )}

        <div>
          <label className={labelCls}>Notes <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span></label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>

        <FormErrorBanner message={formError} />

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 rounded-lg transition-colors">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Saving…' : 'Apply override'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
