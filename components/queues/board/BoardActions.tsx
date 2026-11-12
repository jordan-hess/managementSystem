type Props = {
  showCopy: boolean
  canAutoFill: boolean
  canClear: boolean
  canCopy: boolean
  onAutoFill: () => void
  onClear: () => void
  onCopy: () => void
}

const BUTTON =
  'min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:disabled:hover:bg-gray-900'

// Bulk-action buttons for the coverage bar. The parent only renders this for
// editors; each button is one batched commit there.
export default function BoardActions({ showCopy, canAutoFill, canClear, canCopy, onAutoFill, onClear, onCopy }: Props) {
  return (
    <>
      <button type="button" disabled={!canAutoFill} onClick={onAutoFill} className={BUTTON}>
        Auto-fill gaps
      </button>
      <button type="button" disabled={!canClear} onClick={onClear} className={BUTTON}>
        Clear board
      </button>
      {showCopy && (
        <button type="button" disabled={!canCopy} onClick={onCopy} className={BUTTON}>
          Copy today&apos;s plan
        </button>
      )}
    </>
  )
}
