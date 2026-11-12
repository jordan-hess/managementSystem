'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitOvertimeRequest } from '@/app/(app)/roster/actions'
import { Profile, Team, OvertimeEntry, ShiftType } from '@/types'
import { Plus, Trash2, Loader2, CheckCircle } from 'lucide-react'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const SHIFT_OPTIONS: { value: ShiftType; label: string }[] = [
  { value: 'day',     label: 'Day'     },
  { value: 'evening', label: 'Evening' },
  { value: 'night',   label: 'Night'   },
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type EntryRow = Omit<OvertimeEntry, 'id' | 'overtime_request_id'> & { localId: string }

function newRow(sortOrder: number): EntryRow {
  return {
    localId: crypto.randomUUID(),
    date: '',
    shift: 'day',
    ot_1_5: 0,
    ot_2_0: 0,
    night_hours: 0,
    sort_order: sortOrder,
  }
}

function getDayName(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return isNaN(d.getTime()) ? '' : DAY_NAMES[d.getDay()]
}

interface Props {
  profile: Profile
  userTeam: Team | null
  onSuccess: () => void
}

export default function OvertimeRequestForm({ profile, userTeam, onSuccess }: Props) {
  const router = useRouter()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<EntryRow[]>([newRow(0)])
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<'rows' | 'year'>(['rows', 'year'])
  const [done, setDone] = useState(false)

  const formRef = useRef<HTMLFormElement>(null)
  const successRef = useRef<HTMLDivElement>(null)

  function updateRow(localId: string, patch: Partial<EntryRow>) {
    setRows(prev => prev.map(r => r.localId === localId ? { ...r, ...patch } : r))
    clearFieldError('rows')
  }

  function addRow() {
    setRows(prev => [...prev, newRow(prev.length)])
  }

  function removeRow(localId: string) {
    setRows(prev => prev.filter(r => r.localId !== localId))
  }

  // Totals
  const totals = rows.reduce(
    (acc, r) => ({
      ot_1_5: acc.ot_1_5 + (r.ot_1_5 || 0),
      ot_2_0: acc.ot_2_0 + (r.ot_2_0 || 0),
      night_hours: acc.night_hours + (r.night_hours || 0),
    }),
    { ot_1_5: 0, ot_2_0: 0, night_hours: 0 }
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const filledRows = rows.filter(r => r.date)
    clearAll()
    // noValidate drops the browser's min/max/step checks on these number inputs, so they are checked here.
    const errs: { rows?: string; year?: string } = {}
    if (!Number.isInteger(year) || year < 2020 || year > 2099) errs.year = 'Enter a year between 2020 and 2099.'
    if (filledRows.length === 0) errs.rows = 'Please add at least one date entry.'
    else if (filledRows.some(r => [r.ot_1_5, r.ot_2_0, r.night_hours].some(h => h < 0 || (h * 2) % 1 !== 0))) {
      errs.rows = 'Overtime hours must be 0 or more, in steps of 0.5.'
    }
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    setSaving(true)

    const result = await submitOvertimeRequest({
      month,
      year,
      notes: notes || null,
      entries: filledRows.map(r => ({
        date: r.date,
        shift: r.shift,
        ot_1_5: r.ot_1_5 || 0,
        ot_2_0: r.ot_2_0 || 0,
        night_hours: r.night_hours || 0,
      })),
    })

    setSaving(false)
    if (result.error) { applyActionError(result); return }

    // Success animation
    setDone(true)
    import('animejs').then(({ animate }) => {
      if (formRef.current) {
        animate(formRef.current, { opacity: [1, 0], duration: 200, easing: 'easeOutQuad' })
      }
      setTimeout(() => {
        if (successRef.current) {
          animate(successRef.current, { opacity: [0, 1], scale: [0.7, 1], duration: 400, easing: 'easeOutBack' })
        }
      }, 220)
      setTimeout(() => {
        router.refresh()
        onSuccess()
      }, 1700)
    })
  }

  const inputCls = 'w-full px-2 py-1.5 border border-gray-700 rounded text-xs bg-gray-800 text-white focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none'
  const labelCls = 'block text-sm font-medium text-gray-300 mb-1'

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
          <p className="text-sm text-gray-400">Your overtime request has been sent for review.</p>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Month / Year */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Month</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-700 rounded-lg text-sm bg-gray-800 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Year</label>
            <input
              id="overtime-year"
              type="number"
              min={2020}
              max={2099}
              value={year}
              onChange={e => { setYear(Number(e.target.value)); clearFieldError('year') }}
              className={fieldInputClass('w-full px-3 py-2 border border-gray-700 rounded-lg text-sm bg-gray-800 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none', !!fieldErrors.year)}
              {...fieldA11y('overtime-year', fieldErrors.year)}
            />
            <FieldError id="overtime-year" message={fieldErrors.year} tone="dark" />
          </div>
        </div>

        {/* Employee info bar */}
        <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-800/60 rounded-lg border border-gray-700">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-white">{profile.full_name}</p>
            <p className="text-xs text-gray-400">
              {userTeam ? `${userTeam.name} Team` : 'No team assigned'}
            </p>
          </div>
        </div>

        {/* Entries table */}
        <div>
          <label className={labelCls}>Overtime Entries</label>
          <div
            id="overtime-rows" role="group" {...fieldA11y('overtime-rows', fieldErrors.rows)}
            className={fieldInputClass('rounded-lg border border-gray-700 overflow-hidden', !!fieldErrors.rows)}
          >
            {/* Table header */}
            <div className="grid grid-cols-[1fr_44px_80px_60px_60px_60px_32px] gap-0 bg-gray-800/60 border-b border-gray-700">
              {['Date', 'Day', 'Shift', 'OT 1.5', 'OT 2.0', 'Night', ''].map((h, i) => (
                <div key={i} className="px-1.5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-center first:text-left">
                  {h}
                </div>
              ))}
            </div>

            {/* Table rows */}
            <div className="divide-y divide-gray-700/50">
              {rows.map(row => (
                <div key={row.localId} className="grid grid-cols-[1fr_44px_80px_60px_60px_60px_32px] gap-0 items-center py-1.5 px-1 hover:bg-gray-800/30 transition-colors">
                  {/* Date */}
                  <div className="px-0.5">
                    <input
                      type="date"
                      value={row.date}
                      onChange={e => updateRow(row.localId, { date: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  {/* Day (auto) */}
                  <div className="px-0.5 text-center">
                    <span className="text-xs text-gray-400 font-medium">
                      {getDayName(row.date) || '—'}
                    </span>
                  </div>
                  {/* Shift */}
                  <div className="px-0.5">
                    <select
                      value={row.shift}
                      onChange={e => updateRow(row.localId, { shift: e.target.value as ShiftType })}
                      className={inputCls}
                    >
                      {SHIFT_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* OT 1.5 */}
                  <div className="px-0.5">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={row.ot_1_5 || ''}
                      onChange={e => updateRow(row.localId, { ot_1_5: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className={inputCls + ' text-center'}
                    />
                  </div>
                  {/* OT 2.0 */}
                  <div className="px-0.5">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={row.ot_2_0 || ''}
                      onChange={e => updateRow(row.localId, { ot_2_0: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className={inputCls + ' text-center'}
                    />
                  </div>
                  {/* Night */}
                  <div className="px-0.5">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={row.night_hours || ''}
                      onChange={e => updateRow(row.localId, { night_hours: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className={inputCls + ' text-center'}
                    />
                  </div>
                  {/* Remove */}
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.localId)}
                      disabled={rows.length === 1}
                      className="p-1 text-gray-600 hover:text-red-400 disabled:opacity-30 transition-colors rounded"
                      aria-label="Remove row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals row */}
            <div className="grid grid-cols-[1fr_44px_80px_60px_60px_60px_32px] gap-0 items-center py-2 px-1 border-t border-gray-700 bg-gray-800/40">
              <div className="px-1.5 col-span-3 text-xs font-semibold text-gray-400 text-right pr-2">Totals</div>
              <div className="px-0.5 text-center text-xs font-semibold text-white">{totals.ot_1_5 > 0 ? totals.ot_1_5 : '—'}</div>
              <div className="px-0.5 text-center text-xs font-semibold text-white">{totals.ot_2_0 > 0 ? totals.ot_2_0 : '—'}</div>
              <div className="px-0.5 text-center text-xs font-semibold text-white">{totals.night_hours > 0 ? totals.night_hours : '—'}</div>
              <div />
            </div>
          </div>

          <FieldError id="overtime-rows" message={fieldErrors.rows} tone="dark" />

          {/* Add row button */}
          <button
            type="button"
            onClick={addRow}
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Row
          </button>
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls}>
            Notes <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Add any notes for the admin..."
            className="w-full px-3 py-2 border border-gray-700 rounded-lg text-sm bg-gray-800 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
          />
        </div>

        <FormErrorBanner message={formError} tone="dark" />

        <button
          type="submit"
          disabled={saving || done}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-blue-400 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Submitting…' : 'Submit Overtime Request'}
        </button>
      </form>
    </div>
  )
}
