'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle, ChevronDown, ShieldAlert } from 'lucide-react'
import { Warning, WarningType } from '@/types'

const warningTypeBadge: Record<WarningType, string> = {
  verbal:  'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  written: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
  final:   'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
}

const warningTypeLabel: Record<WarningType, string> = {
  verbal: 'Verbal',
  written: 'Written',
  final: 'Final',
}

const warningTypeBorder: Record<WarningType, string> = {
  verbal:  'border-yellow-400 dark:border-yellow-600',
  written: 'border-orange-400 dark:border-orange-600',
  final:   'border-red-400 dark:border-red-600',
}

// Highest severity first — a mixed-type console is outlined by its most severe warning.
const WARNING_SEVERITY: WarningType[] = ['final', 'written', 'verbal']

interface Props {
  warnings: Warning[]
  // Pinned-to-bottom-of-page treatment (DashboardContent's usage). The standalone
  // /qa page renders this as a normal in-flow section instead — see `sticky={false}`.
  sticky?: boolean
}

export default function WarningsPanel({ warnings, sticky = true }: Props) {
  const [warningsOpen, setWarningsOpen] = useState(false)

  const mostSevereType = WARNING_SEVERITY.find(t => warnings.some(w => w.type === t))
  const warningsBorder = mostSevereType ? warningTypeBorder[mostSevereType] : 'border-gray-200 dark:border-gray-800'

  const panel = (
    <div className={`rounded-xl border-2 ${warningsBorder} bg-white dark:bg-gray-900 shadow-lg overflow-hidden`}>
      <button
        type="button"
        onClick={() => setWarningsOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
      >
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-gray-400" />
          Warnings
          {warnings.length > 0 && (
            <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full px-2 py-0.5 font-medium">
              {warnings.length}
            </span>
          )}
        </h2>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${warningsOpen ? 'rotate-180' : ''}`} />
      </button>
      {warningsOpen && (
        <div className="border-t border-gray-100 dark:border-gray-800 max-h-72 overflow-y-auto">
          {warnings.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No warnings on record</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {warnings.map(w => (
                <div key={w.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${warningTypeBadge[w.type]}`}>{warningTypeLabel[w.type]}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {format(new Date(w.created_at), 'dd MMM yyyy HH:mm')} · issued by {w.issuer?.full_name ?? 'Unknown'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300"><span className="font-medium">Reason:</span> {w.reason}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    <span className="font-medium">Next steps:</span> {w.next_steps ?? 'No follow-up actions recorded'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (!sticky) return panel

  return (
    <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-950 px-6 pb-6 pt-3">
      {panel}
    </div>
  )
}
