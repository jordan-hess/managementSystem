'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { exportReviewsCsvAction } from '@/app/(app)/qa-reviews/exportActions'

const inputCls = 'w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none'
const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1'

/** Export CSV with a custom date range (interaction date, inclusive) — one row per review. Defaults to the overview's period. */
export default function ExportReviewsButton({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  async function handleDownload() {
    setError(null)
    if (!from || !to) { setError('Pick a start and end date.'); return }
    if (from > to) { setError('The start date must be on or before the end date.'); return }
    setExporting(true)
    const res = await exportReviewsCsvAction(from, to)
    setExporting(false)
    if ('error' in res) { setError(res.error); return }
    if (res.count === 0) { setError('No reviews in this date range.'); return }

    // BOM so Excel reads the file as UTF-8 (names with accents, the en dashes in the headers).
    const blob = new Blob(['﻿', res.csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = from === to ? `qa-reviews_${from}.csv` : `qa-reviews_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setError(null)
          // Each opening starts from the overview's current period.
          if (!open) { setFrom(defaultFrom); setTo(defaultTo) }
          setOpen(!open)
        }}
        aria-expanded={open}
        title="Export reviews as CSV"
        className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <Download className="w-4 h-4" /> Export CSV
      </button>

      {open && (
        <div role="dialog" aria-label="Export reviews" className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] p-4 space-y-3 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">One row per review, by interaction date.</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="export-from" className={labelCls}>From</label>
              <input id="export-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="export-to" className={labelCls}>To</label>
              <input id="export-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </div>
          </div>
          {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="button"
            onClick={handleDownload}
            disabled={exporting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? 'Exporting…' : 'Download CSV'}
          </button>
        </div>
      )}
    </div>
  )
}
