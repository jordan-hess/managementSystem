'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { QaSettings } from '@/types'
import { saveSettingsAction, countReviewsAffectedBySettings } from '@/app/(app)/qa-reviews/settingsActions'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

interface Props {
  /** Newest first (getSettingsHistory order). */
  history: QaSettings[]
  /** 'YYYY-MM-DD' business date — default effective-from, and picks which row is "current". */
  today: string
}

const inputCls = 'w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none'
const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1'
const cardCls = 'bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800'

export default function SettingsManager({ history, today }: Props) {
  const router = useRouter()
  const current = history.find((s) => s.effective_from <= today) ?? history[0]

  const [passMark, setPassMark] = useState(String(current?.pass_mark ?? ''))
  const [excellentFrom, setExcellentFrom] = useState(String(current?.excellent_from ?? ''))
  const [criticalFailCap, setCriticalFailCap] = useState(String(current?.critical_fail_cap ?? ''))
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [affected, setAffected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const resetPending = () => { setAffected(null); setError(''); setNotice('') }

  async function handleSave() {
    resetPending()
    const fields: [string, string][] = [['Pass mark', passMark], ['Excellent from', excellentFrom], ['Critical-fail cap', criticalFailCap]]
    for (const [label, raw] of fields) {
      if (raw.trim() === '' || !Number.isFinite(Number(raw))) { setError(`${label} must be a number.`); return }
    }
    if (!effectiveFrom) { setError('Effective from date is required.'); return }
    setBusy(true)
    const result = await countReviewsAffectedBySettings(effectiveFrom)
    setBusy(false)
    if ('error' in result) { setError(result.error); return }
    setAffected(result.count)
  }

  async function handleConfirm() {
    setError('')
    setBusy(true)
    const result = await saveSettingsAction({
      passMark: Number(passMark),
      excellentFrom: Number(excellentFrom),
      criticalFailCap: Number(criticalFailCap),
      effectiveFrom,
    })
    setBusy(false)
    if ('error' in result) { setError(result.error); return }
    setAffected(null)
    setNotice(`Settings saved. ${result.rescored} review${result.rescored === 1 ? '' : 's'} re-scored.`)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {current && (
        <div className={`${cardCls} p-5`}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Current settings (from {current.effective_from})</h2>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div><dt className="text-xs text-gray-500 dark:text-gray-400">Pass mark</dt><dd data-testid="current-pass-mark" className="font-semibold text-gray-900 dark:text-white">{current.pass_mark}</dd></div>
            <div><dt className="text-xs text-gray-500 dark:text-gray-400">Excellent from</dt><dd data-testid="current-excellent-from" className="font-semibold text-gray-900 dark:text-white">{current.excellent_from}</dd></div>
            <div><dt className="text-xs text-gray-500 dark:text-gray-400">Critical-fail cap</dt><dd data-testid="current-critical-cap" className="font-semibold text-gray-900 dark:text-white">{current.critical_fail_cap}</dd></div>
          </dl>
        </div>
      )}

      <div className={`${cardCls} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Add new settings</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="qa-pass-mark" className={labelCls}>Pass mark</label>
            <input id="qa-pass-mark" type="number" step="0.01" value={passMark} onChange={(e) => { setPassMark(e.target.value); resetPending() }} className={inputCls} />
          </div>
          <div>
            <label htmlFor="qa-excellent-from" className={labelCls}>Excellent from</label>
            <input id="qa-excellent-from" type="number" step="0.01" value={excellentFrom} onChange={(e) => { setExcellentFrom(e.target.value); resetPending() }} className={inputCls} />
          </div>
          <div>
            <label htmlFor="qa-critical-cap" className={labelCls}>Critical-fail cap</label>
            <input id="qa-critical-cap" type="number" step="0.01" value={criticalFailCap} onChange={(e) => { setCriticalFailCap(e.target.value); resetPending() }} className={inputCls} />
          </div>
          <div>
            <label htmlFor="qa-effective-from" className={labelCls}>Effective from</label>
            <input id="qa-effective-from" type="date" value={effectiveFrom} onChange={(e) => { setEffectiveFrom(e.target.value); resetPending() }} className={inputCls} />
          </div>
        </div>

        {affected !== null && (
          <div className="text-sm px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300">
            {affected} review{affected === 1 ? '' : 's'} will be re-scored.
            <div className="mt-1 text-xs">Pass mark {passMark} · Excellent from {excellentFrom} · Critical-fail cap {criticalFailCap} · effective {effectiveFrom}</div>
          </div>
        )}
        <FormErrorBanner message={error} />
        {notice && <p role="status" className="text-sm text-green-700 dark:text-green-400">{notice}</p>}

        <div className="flex justify-end gap-2">
          {affected !== null ? (
            <>
              <button type="button" onClick={resetPending} className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button type="button" onClick={handleConfirm} disabled={busy} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Confirm and save
              </button>
            </>
          ) : (
            <button type="button" onClick={handleSave} disabled={busy} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save settings
            </button>
          )}
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <th className="px-4 py-2.5">Effective from</th>
              <th className="px-4 py-2.5">Pass mark</th>
              <th className="px-4 py-2.5">Excellent from</th>
              <th className="px-4 py-2.5">Critical-fail cap</th>
              <th className="px-4 py-2.5">Created by</th>
            </tr>
          </thead>
          <tbody>
            {history.map((s) => (
              <tr key={s.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-4 py-2.5 text-gray-900 dark:text-white">{s.effective_from}</td>
                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{s.pass_mark}</td>
                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{s.excellent_from}</td>
                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{s.critical_fail_cap}</td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{s.created_by_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
