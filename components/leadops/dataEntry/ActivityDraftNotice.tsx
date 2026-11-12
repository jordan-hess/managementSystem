'use client'

import { btnOutline, btnPrimary } from '../statusStyles'

interface Props {
  /** The form was started from an unsent draft kept on this device. */
  restored?: boolean
  /** The last save did not go through; what was typed is kept on this device. */
  unsent?: boolean
  retrying?: boolean
  onRetry?: () => void
  /** A draft on this device differs from what is saved: let the user choose. */
  pending?: boolean
  onUsePending?: () => void
  onDiscardPending?: () => void
}

const boxCls = 'rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3'
const textCls = 'text-sm text-amber-900 dark:text-amber-200'

/** The small notices about a device draft. Renders nothing when there is nothing to say. */
export default function ActivityDraftNotice({ restored, unsent, retrying, onRetry, pending, onUsePending, onDiscardPending }: Props) {
  if (!restored && !unsent && !pending) return null
  return (
    <div className="space-y-2" role="status">
      {pending && (
        <div className={boxCls}>
          <p className={textCls}>Unsent changes from this device differ from what is saved.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onUsePending} className={btnPrimary}>Use them</button>
            <button type="button" onClick={onDiscardPending} className={btnOutline}>Discard</button>
          </div>
        </div>
      )}
      {unsent && (
        <div className={boxCls}>
          <p className={textCls}>Not saved yet — kept on this device. It is sent again when the connection returns.</p>
          <button type="button" onClick={onRetry} disabled={retrying} className={btnOutline}>Retry</button>
        </div>
      )}
      {restored && !unsent && (
        <p className={textCls}>Restored your unsent entry from this device — check it, then Save.</p>
      )}
    </div>
  )
}
