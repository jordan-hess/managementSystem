'use client'

import { useState, useEffect } from 'react'
import { assignShiftOverridesAction } from '@/app/(app)/roster/actions'
import Modal from '@/components/ui/Modal'
import { ShiftTemplate } from '@/types'
import { getISOWeekStart, formatDateKey } from '@/lib/roster/calendarUtils'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type AssignShiftField = 'shift' | 'week_start' | 'days'
const ASSIGN_SHIFT_FIELDS: readonly AssignShiftField[] = ['shift', 'week_start', 'days']

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// ISO day-of-week value for each index: 1=Mon … 7=Sun
const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7]

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  profileId: string
  profileName: string
  shiftTemplates: ShiftTemplate[]
  currentUserId: string
}

export default function AssignShiftModal({ open, onClose, onSuccess, profileId, profileName, shiftTemplates, currentUserId }: Props) {
  const todayMonday = formatDateKey(getISOWeekStart(new Date()))

  const [templateId, setTemplateId] = useState('')
  const [weekStart, setWeekStart] = useState(todayMonday)
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<AssignShiftField>(ASSIGN_SHIFT_FIELDS)

  // When template changes, pre-fill days from its work_days
  useEffect(() => {
    if (!templateId) { setSelectedDays([]); return }
    const tpl = shiftTemplates.find(t => t.id === templateId)
    setSelectedDays(tpl ? [...tpl.work_days] : [])
  }, [templateId, shiftTemplates])

  // Reset on open
  useEffect(() => {
    if (open) { setTemplateId(''); setWeekStart(todayMonday); setSelectedDays([]); clearAll() }
  }, [open])

  function toggleDay(iso: number) {
    setSelectedDays(prev => prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso].sort((a, b) => a - b))
    clearFieldError('days')
  }

  function isValidMonday(dateStr: string): boolean {
    return new Date(dateStr + 'T00:00:00').getDay() === 1
  }

  // Build the actual dates for the selected week's chosen days
  function buildDates(): string[] {
    if (!isValidMonday(weekStart)) return []
    const monday = new Date(weekStart + 'T00:00:00')
    return selectedDays.map(iso => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + (iso - 1)) // iso 1=Mon → offset 0, iso 7=Sun → offset 6
      return formatDateKey(d)
    })
  }

  const selectedTemplate = shiftTemplates.find(t => t.id === templateId)
  const dates = buildDates()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    const errs: Partial<Record<AssignShiftField, string>> = {}
    if (!templateId) errs.shift = 'Please select a shift.'
    if (!isValidMonday(weekStart)) errs.week_start = 'Week start must be a Monday.'
    if (selectedDays.length === 0) errs.days = 'Select at least one day.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    setSaving(true)

    const result = await assignShiftOverridesAction(profileId, templateId, dates)

    setSaving(false)
    if ('error' in result) { applyActionError(result); return }
    onSuccess()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign Shift">
      {/* Agent context */}
      <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg">
        <p className="text-sm font-medium text-gray-900">{profileName}</p>
        <p className="text-xs text-gray-500">Shift assignment applies as a schedule override</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Shift template */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
          <select
            id="assign-shift-shift" required
            value={templateId}
            onChange={e => { setTemplateId(e.target.value); clearFieldError('shift'); clearFieldError('days') }}
            className={fieldInputClass('w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none', !!fieldErrors.shift)}
            {...fieldA11y('assign-shift-shift', fieldErrors.shift)}
          >
            <option value="">Select shift…</option>
            {shiftTemplates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.start_time.slice(0, 5)} to {t.end_time.slice(0, 5)}
              </option>
            ))}
          </select>
          <FieldError id="assign-shift-shift" message={fieldErrors.shift} />
          {selectedTemplate && (
            <p className="text-xs text-gray-400 mt-1">
              Default days: {selectedTemplate.work_days.map(d => DAY_NAMES[d - 1]).join(', ')}
            </p>
          )}
        </div>

        {/* Week picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Week starting (Monday)</label>
          <input
            id="assign-shift-week_start" type="date"
            required
            value={weekStart}
            onChange={e => { setWeekStart(e.target.value); clearFieldError('week_start') }}
            className={fieldInputClass('w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none', !!fieldErrors.week_start)}
            {...fieldA11y('assign-shift-week_start', fieldErrors.week_start)}
          />
          <FieldError id="assign-shift-week_start" message={fieldErrors.week_start} />
          {weekStart && !isValidMonday(weekStart) && (
            <p className="text-xs text-amber-600 mt-1">Please select a Monday.</p>
          )}
        </div>

        {/* Day selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Days to assign</label>
          <div
            id="assign-shift-days" role="group" {...fieldA11y('assign-shift-days', fieldErrors.days)}
            className={`flex gap-2 flex-wrap ${fieldErrors.days ? 'rounded-lg border border-red-500 p-1' : ''}`}
          >
            {ISO_DAYS.map((iso, i) => (
              <button
                key={iso}
                type="button"
                onClick={() => toggleDay(iso)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  selectedDays.includes(iso)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {DAY_NAMES[i]}
              </button>
            ))}
          </div>
          <FieldError id="assign-shift-days" message={fieldErrors.days} />
        </div>

        {/* Summary */}
        {dates.length > 0 && selectedTemplate && (
          <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 space-y-0.5">
            <p className="font-medium text-blue-700">{dates.length} shift{dates.length !== 1 ? 's' : ''} will be assigned:</p>
            {dates.map(d => (
              <p key={d}>
                {new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                {' '}&mdash; {selectedTemplate.start_time.slice(0, 5)}–{selectedTemplate.end_time.slice(0, 5)}
              </p>
            ))}
          </div>
        )}

        <FormErrorBanner message={formError} />

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
          >
            {saving ? 'Assigning…' : 'Assign shift'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
