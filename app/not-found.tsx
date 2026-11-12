import { SearchX } from 'lucide-react'

// Global 404 - previously unhandled (no not-found.tsx anywhere in the
// app), so e.g. a bad ticket ID fell through to Next's generic 404 instead
// of a branded page with a way back in (2026-09-16 production-readiness
// audit, finding M1).
export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950 px-4">
      <div className="max-w-md w-full text-center">
        <SearchX className="w-14 h-14 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Page not found</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          This page doesn&apos;t exist, or you may not have access to it.
        </p>
        <a
          href="/home"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-lg transition"
        >
          Back to home
        </a>
      </div>
    </div>
  )
}
