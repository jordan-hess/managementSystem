'use client'

import ModalDialog from './ModalDialog'

type Props = {
  open: boolean
  rows: { userId: string; name: string; queue: string }[]
  onCancel: () => void
  onConfirm: () => void
}

// Preview of the auto-fill plan; nothing is saved or notified until confirmed.
// The plan is live, so if a refresh fills every gap while this is open,
// confirm is disabled rather than sending an empty batch.
export default function AutoFillDialog({ open, rows, onCancel, onConfirm }: Props) {
  return (
    <ModalDialog open={open} labelledBy="autofill-dialog-title" onCancel={onCancel}>
      <div className="flex flex-col gap-4 p-5">
        <h2 id="autofill-dialog-title" className="text-base font-semibold">
          Assign {rows.length} agents and notify them?
        </h2>
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm text-gray-700 dark:text-gray-300">
          {rows.map((r) => (
            <li key={r.userId}>
              {r.name} → {r.queue}
            </li>
          ))}
        </ul>
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
            onClick={onConfirm}
            disabled={rows.length === 0}
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Assign and notify
          </button>
        </div>
      </div>
    </ModalDialog>
  )
}
