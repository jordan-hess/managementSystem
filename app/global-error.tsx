'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

// Catches errors thrown by the root layout itself, where the nearest normal
// error.tsx boundary (app/(app)/error.tsx) can't help - Next.js requires
// this file to render its own <html>/<body> since it replaces the root
// layout entirely. Previously there was no boundary anywhere in the app at
// all, so an unhandled error fell through to Next's generic error page
// (2026-09-16 production-readiness audit, finding M1).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('global-error boundary caught:', error)
  }, [error])

  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <AlertTriangle className="w-14 h-14 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            opsHub hit an unexpected error. You can try again, or reload the page if it keeps happening.
          </p>
          <button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-lg transition"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
