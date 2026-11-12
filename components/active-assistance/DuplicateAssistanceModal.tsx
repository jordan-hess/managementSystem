'use client'

import Modal from '@/components/ui/Modal'
import ActiveAssistanceBanner from './ActiveAssistanceBanner'
import { ActiveAssistanceRecord } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  records: ActiveAssistanceRecord[]
  canTakeOwnership?: boolean
  onViewExisting?: (record: ActiveAssistanceRecord) => void
  /** Per-record: can "View Existing Ticket" actually navigate there from here (e.g. a Social
   *  agent can't reach a T2 ticket's detail page, and vice versa — proxy.ts blocks it either
   *  direction). Defaults to always viewable. */
  isViewable?: (record: ActiveAssistanceRecord) => boolean
  onTakeOwnership?: (record: ActiveAssistanceRecord) => void
  onContinueAnyway: () => void
}

export default function DuplicateAssistanceModal({
  open, onClose, records, canTakeOwnership = false, onViewExisting, isViewable = () => true, onTakeOwnership, onContinueAnyway,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Possible Duplicate">
      <div className="space-y-4">
        <ActiveAssistanceBanner records={records} variant="banner" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Creating another ticket may result in duplicate troubleshooting or conflicting customer communication.
        </p>

        <div className="space-y-2">
          {records.map(r => {
            const viewable = isViewable(r)
            return (
              <div key={`${r.sourceType}-${r.sourceId}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{r.ticketLabel}</span>
                <div className="flex items-center gap-3 shrink-0">
                  {onViewExisting && (
                    <button
                      type="button"
                      onClick={() => viewable && onViewExisting(r)}
                      disabled={!viewable}
                      title={viewable ? undefined : 'Not accessible from here'}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed"
                    >
                      View Existing Ticket
                    </button>
                  )}
                  {canTakeOwnership && onTakeOwnership && (
                    <button
                      type="button"
                      onClick={() => onTakeOwnership(r)}
                      className="text-xs font-medium text-purple-600 hover:text-purple-800 dark:text-purple-400"
                    >
                      Take Ownership
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinueAnyway}
            className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
          >
            Continue and Create Anyway
          </button>
        </div>
      </div>
    </Modal>
  )
}
