'use client'

import { useState } from 'react'
import { useReportParams } from './useReportParams'

const PRESETS: { value: string; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

interface Props {
  period: string
  from: string
  to: string
}

export default function PeriodPicker({ period, from, to }: Props) {
  const { setParams } = useReportParams()
  const [customOpen, setCustomOpen] = useState(period === 'custom')
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)

  function applyCustom() {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return
    setParams({ period: 'custom', from: draftFrom, to: draftTo })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => { setCustomOpen(false); setParams({ period: p.value, from: null, to: null }) }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              period === p.value
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((o) => !o)}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            period === 'custom'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Custom
        </button>
      </div>

      {customOpen && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={draftFrom}
            max={draftTo}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          />
          <span className="text-xs text-gray-400 dark:text-gray-500">to</span>
          <input
            type="date"
            value={draftTo}
            min={draftFrom}
            onChange={(e) => setDraftTo(e.target.value)}
            className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          />
          <button
            type="button"
            onClick={applyCustom}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
