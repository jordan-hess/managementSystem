'use client'

import { useEffect } from 'react'

export interface BoardToastData {
  id: number // bumps on every new toast, so a repeat message restarts the timer
  message: string
  tone: 'success' | 'error'
  onUndo?: () => void
}

const LIFETIME_MS = 4500

interface Props {
  toast: BoardToastData | null
  onDismiss: () => void
}

// The polite region is always mounted so screen readers pick up each new
// success message; an error toast is a role="alert" instead, so it interrupts.
// A newer toast simply replaces the older one (only the latest action is
// undoable).
export default function BoardToast({ toast, onDismiss }: Props) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDismiss, LIFETIME_MS)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  const body = toast && (
    <div
      key={toast.id}
      className={`animate-toast-up motion-reduce:animate-none pointer-events-auto flex items-center gap-4 rounded-full px-5 py-2 text-sm font-medium shadow-lg ${
        toast.tone === 'error'
          ? 'bg-red-600 text-white'
          : 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
      }`}
    >
      <span>{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          onClick={() => {
            const undo = toast.onUndo
            onDismiss()
            undo?.()
          }}
          className="min-h-11 rounded-xl px-3 font-semibold text-blue-300 hover:underline dark:text-blue-700"
        >
          Undo
        </button>
      )}
    </div>
  )
  const isError = toast?.tone === 'error'

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div aria-live="polite">{!isError && body}</div>
      {isError && <div role="alert">{body}</div>}
    </div>
  )
}
