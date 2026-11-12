'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

// Error boundary for every page under the (app) route group - previously
// there was no error.tsx anywhere in the app, so any unhandled Server
// Component error fell through to Next's generic error page instead of
// something branded/recoverable (2026-09-16 production-readiness audit,
// finding M1). Wraps pages/nested layouts in this segment; does not catch
// errors thrown by app/(app)/layout.tsx itself (Next.js limitation) - those
// bubble up to app/global-error.tsx.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('(app) error boundary caught:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full text-center">
        <AlertTriangle className="w-14 h-14 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          This page hit an unexpected error. Try again, or head back to your dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-lg transition"
          >
            Try again
          </button>
          <a
            href="/home"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 py-2.5 px-4 transition"
          >
            Back to home
          </a>
        </div>
      </div>
    </div>
  )
}
