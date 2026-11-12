'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitLeaveRequest } from '@/app/(app)/roster/actions'
import { Profile, Team, LeaveType } from '@/types'
import { getMonthGridDays, formatDateKey, isSameMonth, isToday } from '@/lib/roster/calendarUtils'
import { ChevronLeft, ChevronRight, X, Loader2, CheckCircle } from 'lucide-react'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'annual',               label: 'Annual Leave'          },
  { value: 'sick',                 label: 'Sick Leave'            },
  { value: 'family_responsibility', label: 'Family Responsibility' },
  { value: 'unpaid',               label: 'Unpaid Leave'          },
  { value: 'other',                label: 'Other'                  },
]

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  profile: Profile
  userTeam: Team | null
  onSuccess: () => void
}

export default function LeaveRequestForm({ profile, userTeam, onSuccess }: Props) {
  const router = useRouter()
  const [leaveType, setLeaveType] = useState<LeaveType>('annual')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<'dates'>(['dates'])
  const [done, setDone] = useState(false)

  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())

  const successRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function navigateMonth(dir: -1 | 1) {
    const d = new Date(calYear, calMonth + dir, 1)
    setCalYear(d.getFullYear())
    setCalMonth(d.getMonth())
  }

  function toggleDate(dateStr: string) {
    setSelectedDates(prev => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
    clearFieldError('dates')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    if (selectedDates.size === 0) { setFieldErrors({ dates: 'Please select at least one date.' }); return }
    setSaving(true)

    const sortedDates = [...selectedDates].sort()
    const result = await submitLeaveRequest({
      leaveType,
      dates: sortedDates,
      notes: notes || null,
    })

    setSaving(false)

    if (result.error) {
      applyActionError(result)
      return
    }

    // Success animation
    setDone(true)
    import('animejs').then(({ animate }) => {
      if (formRef.current) {
        animate(formRef.current, {
          opacity: [1, 0],
          duration: 200,
          easing: 'easeOutQuad',
        })
      }
      setTimeout(() => {
        if (successRef.current) {
          animate(successRef.current, {
            opacity: [0, 1],
            scale: [0.7, 1],
            duration: 400,
            easing: 'easeOutBack',
          })
        }
      }, 220)
      setTimeout(() => {
        router.refresh()
        onSuccess()
      }, 1700)
    })
  }

  const days = getMonthGridDays(calYear, calMonth)
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

  const inputCls = 'w-full px-3 py-2 border border-gray-700 rounded-lg text-sm bg-gray-800 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900'

  return (
    <div className="relative p-5">
      {/* Success overlay */}
      {done && (
        <div
          ref={successRef}
          style={{ opacity: 0 }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-gray-900"
        >
          <CheckCircle className="w-16 h-16 text-green-400" />
          <p className="text-lg font-semibold text-white">Request Submitted</p>
          <p className="text-sm text-gray-400">Your leave request has been sent for review.</p>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Leave type */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Leave Type</label>
          <div className="grid grid-cols-1 gap-1.5">
            {LEAVE_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setLeaveType(value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border text-left transition-colors ${
                  leaveType === value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'text-gray-300 border-gray-700 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Date picker */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Select Dates</label>

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => navigateMonth(-1)}
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-200">{monthLabel}</span>
            <button
              type="button"
              onClick={() => navigateMonth(1)}
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Calendar grid */}
          <div
            id="leave-dates" role="group" {...fieldA11y('leave-dates', fieldErrors.dates)}
            className={fieldInputClass('rounded-lg border border-gray-700 overflow-hidden', !!fieldErrors.dates)}
          >
            <div className="grid grid-cols-7 border-b border-gray-700">
              {DAY_LABELS.map(d => (
                <div key={d} className="py-1.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-gray-700/50">
              {days.map((day, idx) => {
                const dateStr = formatDateKey(day)
                const inMonth = isSameMonth(day, calYear, calMonth)
                const today = isToday(day)
                const selected = selectedDates.has(dateStr)

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => inMonth && toggleDate(dateStr)}
                    disabled={!inMonth}
                    className={`min-h-[36px] p-1 flex items-center justify-center text-xs font-medium transition-colors ${
                      !inMonth
                        ? 'text-gray-700 cursor-default'
                        : selected
                          ? 'bg-blue-600 text-white hover:bg-blue-500'
                          : today
                            ? 'text-blue-400 hover:bg-gray-800'
                            : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full ${
                      today && !selected ? 'border border-blue-500' : ''
                    }`}>
                      {day.getDate()}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <FieldError id="leave-dates" message={fieldErrors.dates} tone="dark" />

          {/* Selected date chips */}
          {selectedDates.size > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[...selectedDates].sort().map(d => (
                <span
                  key={d}
                  className="flex items-center gap-1 text-xs bg-blue-900/40 text-blue-300 border border-blue-700/50 rounded-full px-2 py-0.5"
                >
                  {new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                  <button
                    type="button"
                    onClick={() => toggleDate(d)}
                    className="text-blue-400 hover:text-blue-200 transition-colors"
                    aria-label={`Remove ${d}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {selectedDates.size > 0 && (
            <p className="text-xs text-gray-500 mt-1">{selectedDates.size} date{selectedDates.size !== 1 ? 's' : ''} selected</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Notes <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Add any relevant notes for the admin..."
            className={inputCls + ' resize-none'}
          />
        </div>

        <FormErrorBanner message={formError} tone="dark" />

        <button
          type="submit"
          disabled={saving || done}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-blue-400 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Submitting…' : 'Submit Leave Request'}
        </button>
      </form>
    </div>
  )
}
