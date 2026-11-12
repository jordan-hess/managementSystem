import type { coverage } from '@/lib/queues/board'

interface Props {
  stats: ReturnType<typeof coverage>
  actions: React.ReactNode
}

export default function CoverageBar({ stats, actions }: Props) {
  const pct = stats.total === 0 ? 0 : (stats.covered / stats.total) * 100
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="min-w-48 flex-1">
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="font-semibold text-gray-900 dark:text-white">
            {stats.covered} of {stats.total} queues covered
          </span>
          {stats.short > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">{stats.short} short</span>}
        </div>
        <div
          role="progressbar"
          aria-label="Queue coverage"
          aria-valuemin={0}
          aria-valuemax={stats.total}
          aria-valuenow={stats.covered}
          className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              stats.short === 0 ? 'bg-green-500' : 'bg-amber-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {stats.onQueue} on queues · {stats.onBench} on bench
      </p>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}
