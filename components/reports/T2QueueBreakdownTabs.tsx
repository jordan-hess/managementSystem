'use client'

import { QUEUES } from '@/lib/t2/constants'
import { useReportParams } from './useReportParams'
import BreakdownTable from './BreakdownTable'
import { QueueBreakdownData } from '@/lib/reports/t2QueueBreakdown'
import { cardCls, cardPad } from './theme'

interface Props {
  activeQueue: string
  data: QueueBreakdownData
}

/**
 * Tab selection IS the global Queue filter (not separate unsynced state) —
 * clicking a tab pushes `queue` (and `team=t2`) the same way FilterBar's
 * Queue select does, clearing the queue-specific classification filters
 * since they don't carry over between queues (e.g. a SIM Type value has no
 * meaning once the queue changes to VOICE).
 */
export default function T2QueueBreakdownTabs({ activeQueue, data }: Props) {
  const { setParams } = useReportParams()

  return (
    <div className={`${cardCls} ${cardPad}`}>
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 mb-4 w-fit">
        {QUEUES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setParams({ team: 't2', queue: q, issueType: null, rootCause: null })}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeQueue === q
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {q}
          </button>
        ))}
      </div>

      <div className={`grid gap-6 ${data.secondary ? 'sm:grid-cols-2' : ''}`}>
        <BreakdownTable title={data.primary.label} rows={data.primary.rows} />
        {data.secondary && <BreakdownTable title={data.secondary.label} rows={data.secondary.rows} />}
      </div>
    </div>
  )
}
