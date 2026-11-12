'use client'

import { useState } from 'react'
import { REASON_CHIPS } from '@/lib/queues/board'
import ModalDialog from './ModalDialog'

type Props = {
  open: boolean
  agentName: string
  from: string
  to: string
  onCancel: () => void
  onConfirm: (reason: string | null) => void
}

// Optional reason for a same-day lane-to-lane move.
export default function ReasonDialog({ open, agentName, from, to, onCancel, onConfirm }: Props) {
  return (
    <ModalDialog open={open} labelledBy="reason-dialog-title" onCancel={onCancel}>
      <ReasonForm agentName={agentName} from={from} to={to} onCancel={onCancel} onConfirm={onConfirm} />
    </ModalDialog>
  )
}

function ReasonForm({ agentName, from, to, onCancel, onConfirm }: Omit<Props, 'open'>) {
  const [chip, setChip] = useState<string | null>(null)
  const [other, setOther] = useState('')

  function confirm() {
    if (chip === null) onConfirm(null)
    else onConfirm(chip === 'Other' ? other.trim() || 'Other' : chip)
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <h2 id="reason-dialog-title" className="text-base font-semibold">
        Move {agentName} from {from} to {to}?
      </h2>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-300">Reason (optional)</p>
        <div className="flex flex-wrap gap-2">
          {REASON_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={chip === c}
              onClick={() => setChip(c)}
              className={`min-h-11 rounded-full px-4 text-sm font-medium ${
                chip === c
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {chip === 'Other' && (
          <input
            type="text"
            aria-label="Other reason"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            autoFocus
            className="min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          Move
        </button>
      </div>
    </div>
  )
}
