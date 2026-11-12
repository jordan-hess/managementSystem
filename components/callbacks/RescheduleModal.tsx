'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { rescheduleCallback, sendCallbackToLateShift } from '@/app/(app)/support-tickets/actions'
import { Callback } from '@/types'
import { Loader2, Clock, Users } from 'lucide-react'
import { format } from 'date-fns'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  callback: Callback & { customers: { name: string; phone: string } | null }
  currentUserId: string
}

type Action = 'pick' | 'late_shift'

export default function RescheduleModal({ open, onClose, onSuccess, callback, currentUserId }: Props) {
  const [action, setAction] = useState<Action>('pick')
  const [newDateTime, setNewDateTime] = useState(callback.scheduled_at.slice(0, 16))
  const [submitting, setSubmitting] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<'new_date_time'>(['new_date_time'])

  async function handlePickDate(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    if (!newDateTime || Number.isNaN(new Date(newDateTime).getTime())) { setFieldErrors({ new_date_time: 'New date and time is required.' }); return }
    setSubmitting(true)

    const result = await rescheduleCallback(callback.id, new Date(newDateTime).toISOString())

    setSubmitting(false)
    if ('error' in result) { applyActionError({ error: result.error ?? 'Something went wrong.' }); return }
    onSuccess(); onClose()
  }

  async function handleSendToLateShift() {
    clearAll()
    setSubmitting(true)

    const result = await sendCallbackToLateShift(callback.id)

    setSubmitting(false)
    if ('error' in result) { applyActionError({ error: result.error ?? 'Something went wrong.' }); return }
    onSuccess(); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Reschedule Callback">
      <div className="mb-4 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{callback.customers?.name ?? 'Unknown'}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Currently scheduled {format(new Date(callback.scheduled_at), "dd MMM yyyy 'at' HH:mm")}
        </p>
      </div>

      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-4">
        <button
          type="button"
          onClick={() => setAction('pick')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            action === 'pick' ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <Clock className="w-3.5 h-3.5" /> Pick new time
        </button>
        <button
          type="button"
          onClick={() => setAction('late_shift')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            action === 'late_shift' ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Send to Late Shift
        </button>
      </div>

      {action === 'pick' ? (
        <form onSubmit={handlePickDate} noValidate className="space-y-4">
          <div>
            <label className={labelCls}>New Date & Time *</label>
            <input
              id="reschedule-new_date_time" type="datetime-local" required
              value={newDateTime}
              onChange={e => { setNewDateTime(e.target.value); clearFieldError('new_date_time') }}
              className={fieldInputClass(inputCls, !!fieldErrors.new_date_time)} {...fieldA11y('reschedule-new_date_time', fieldErrors.new_date_time)}
            />
            <FieldError id="reschedule-new_date_time" message={fieldErrors.new_date_time} />
          </div>
          <FormErrorBanner message={formError} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors">
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? 'Saving…' : 'Reschedule'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This will hand the callback off to whichever team is rostered on a late shift for{' '}
            <span className="font-medium text-gray-900 dark:text-white">{format(new Date(callback.scheduled_at), 'dd MMM yyyy')}</span>,
            reassigning it directly to that team&rsquo;s leader.
          </p>
          <FormErrorBanner message={formError} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button
              type="button" onClick={handleSendToLateShift} disabled={submitting}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? 'Sending…' : 'Send to Late Shift'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
