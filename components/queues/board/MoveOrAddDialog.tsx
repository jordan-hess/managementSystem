'use client'

import ModalDialog from './ModalDialog'

type Props = {
  open: boolean
  agentName: string
  to: string
  canAdd: boolean
  onMove: () => void
  onAdd: () => void
  onCancel: () => void
}

// Placing an agent who already has a main channel on another lane: move the
// main channel there, or keep it and cover the lane as an additional platform.
export default function MoveOrAddDialog({ open, agentName, to, canAdd, onMove, onAdd, onCancel }: Props) {
  return (
    <ModalDialog open={open} labelledBy="move-or-add-dialog-title" onCancel={onCancel}>
      <div className="flex flex-col gap-4 p-5">
        <h2 id="move-or-add-dialog-title" className="text-base font-semibold">
          Put {agentName} on {to}?
        </h2>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onMove}
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            Move here
          </button>
          <button
            type="button"
            onClick={onAdd}
            disabled={!canAdd}
            aria-describedby={canAdd ? undefined : 'move-or-add-dialog-limit'}
            className="min-h-11 rounded-xl border border-blue-400 bg-white px-4 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-500 dark:bg-gray-900 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            Add as additional platform
          </button>
          {!canAdd && (
            <p id="move-or-add-dialog-limit" className="text-sm text-gray-600 dark:text-gray-300">
              Already on 3 channels
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalDialog>
  )
}
