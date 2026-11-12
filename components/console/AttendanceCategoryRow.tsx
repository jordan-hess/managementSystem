'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface AttendanceCategoryRowProps {
  label: string
  colorClasses: { bg: string; text: string }
  people: { id: string; full_name: string }[]
}

export default function AttendanceCategoryRow({ label, colorClasses, people }: AttendanceCategoryRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-3 py-2"
      >
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        <span className="flex items-center gap-2">
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${colorClasses.bg} ${colorClasses.text}`}>
            {people.length}
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-0.5">
          {people.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">None</p>
          ) : (
            people.map(person => (
              <p key={person.id} className="text-xs text-gray-600 dark:text-gray-400">{person.full_name}</p>
            ))
          )}
        </div>
      )}
    </div>
  )
}
