'use client'

import { useEffect, useState } from 'react'
import { markAttendanceAction, assignShiftOverridesAction } from '@/app/(app)/roster/actions'
import Modal from '@/components/ui/Modal'
import { AttendanceRecord, AttendanceStatus, RosterOverride, ShiftTemplate } from '@/types'
import { Loader2 } from 'lucide-react'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: 'on_shift', label: 'On Shift'      },
  { value: 'late',     label: 'Late'          },
  { value: 'absent',   label: 'Absent / AWOL' },
  { value: 'sick',     label: 'Sick'          },
  { value: 'leave',    label: 'Leave'         },
  { value: 'off',      label: 'Off'           },
]

// The only two shift shapes the app supports (see
// simplify-shift-templates-2026-09-18.sql, which ensures these two exist) -
// matched by time rather than name, since the seeded names could in theory
// be edited by whoever ran the migration.
function findShiftTemplate(templates: ShiftTemplate[], startTime: string, endTime: string): ShiftTemplate | undefined {
  return templates.find(t => t.start_time.slice(0, 5) === startTime && t.end_time.slice(0, 5) === endTime)
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  profileId: string
  profileName: string
  date: string
  existing: AttendanceRecord | null
  /** Today's roster_overrides row for this agent, if any - used to
   *  pre-select the currently-in-effect shift below. */
  currentOverride: RosterOverride | null
  shiftTemplates: ShiftTemplate[]
  currentUserId: string
}

export default function MarkAttendanceModal({ open, onClose, onSuccess, profileId, profileName, date, existing, currentOverride, shiftTemplates, currentUserId }: Props) {
  const [status, setStatus] = useState<AttendanceStatus>(existing?.status ?? 'on_shift')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [hasDoctorNote, setHasDoctorNote] = useState(existing?.has_doctor_note ?? false)
  const [shiftTemplateId, setShiftTemplateId] = useState<string | null>(
    currentOverride?.override_type === 'swap_in' ? currentOverride.shift_template_id : null,
  )
  const [saving, setSaving] = useState(false)
  const { formError, clearAll, applyActionError } = useFormErrors<never>([])

  // Reset to this specific profile/date's own values each time the modal
  // opens - mirrors AssignShiftModal's own "reset on open" pattern, since
  // this component isn't remounted between different targets.
  useEffect(() => {
    if (!open) return
    setStatus(existing?.status ?? 'on_shift')
    setNotes(existing?.notes ?? '')
    setHasDoctorNote(existing?.has_doctor_note ?? false)
    setShiftTemplateId(currentOverride?.override_type === 'swap_in' ? currentOverride.shift_template_id : null)
    clearAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const eightToFive = findShiftTemplate(shiftTemplates, '08:00', '17:00')
  const elevenToEight = findShiftTemplate(shiftTemplates, '11:00', '20:00')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    setSaving(true)

    const attendanceResult = await markAttendanceAction(profileId, date, status, notes || null, hasDoctorNote)
    if ('error' in attendanceResult) { setSaving(false); applyActionError(attendanceResult); return }

    // Only touches roster_overrides for today - a shift change here never
    // affects any other day (product decision: attendance-marking is a
    // per-day action).
    if (shiftTemplateId) {
      const shiftResult = await assignShiftOverridesAction(profileId, shiftTemplateId, [date])
      if ('error' in shiftResult) { setSaving(false); applyActionError(shiftResult); return }
    }

    setSaving(false)
    onSuccess(); onClose()
  }

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Modal open={open} onClose={onClose} title="Mark Attendance">
      <div className="mb-4 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{profileName}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{displayDate}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={`${labelCls} mb-2`}>Status</label>
          <div className="grid grid-cols-3 gap-2">
            {STATUSES.map(({ value, label }) => (
              <button
                key={value} type="button"
                onClick={() => setStatus(value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  status === value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {(eightToFive || elevenToEight) && (
          <div>
            <label className={`${labelCls} mb-2`}>
              Shift <span className="text-gray-400 dark:text-gray-500 font-normal">(optional — changes just this day)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[eightToFive, elevenToEight].filter((t): t is ShiftTemplate => !!t).map(t => (
                <button
                  key={t.id} type="button"
                  onClick={() => setShiftTemplateId(prev => prev === t.id ? null : t.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    shiftTemplateId === t.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {t.start_time.slice(0, 5)} – {t.end_time.slice(0, 5)}
                </button>
              ))}
            </div>
          </div>
        )}

        {status === 'sick' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasDoctorNote}
              onChange={e => setHasDoctorNote(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Doctor&apos;s note provided</span>
          </label>
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
          <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Saving…' : 'Save attendance'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
