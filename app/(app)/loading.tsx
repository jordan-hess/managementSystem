import { Loader2 } from 'lucide-react'

// Loading UI for every page under the (app) route group while its async
// Server Component fetches data - previously heavy pages (dashboard,
// roster, QA) just showed a blank screen on a slow query, with no
// loading.tsx anywhere in the app (2026-09-16 production-readiness audit,
// finding M1).
export default function AppLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
    </div>
  )
}
