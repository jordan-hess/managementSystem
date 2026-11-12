'use client'

import { ClipboardCheck, CheckCircle2, XCircle } from 'lucide-react'
// Type-only: lib/qa/reviewOverviewData.ts imports lib/db/pool (Node-only) —
// a `import type` is fully erased at compile time so it can't drag that
// module's runtime into this client component's browser bundle.
import type { OverviewPeriod, QaOverviewStats } from '@/lib/qa/reviewOverviewData'
import { DEPARTMENTS, type Department } from '@/lib/departments'
import { SCORECARD_ITEMS } from '@/lib/qa/scorecard'
import { DEPARTMENT_LABELS } from '@/lib/qa/constants'

interface Props {
  stats: QaOverviewStats
  period: OverviewPeriod
  department?: Department
  categoryCode?: string
  /** Current values of the review-list filter form below this one (agentId/department/from/to/page) —
   *  carried forward as hidden inputs so changing an overview filter doesn't reset the list filter. */
  hiddenParams: Record<string, string>
}

const tileCls = 'bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800'
const selectCls = 'text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]'

function submitOnChange(e: React.ChangeEvent<HTMLSelectElement>) {
  e.currentTarget.form?.requestSubmit()
}

export default function QaReviewOverview({ stats, period, department, categoryCode, hiddenParams }: Props) {
  return (
    <div className="space-y-3">
      <form method="get" className="flex flex-wrap items-end gap-2">
        {Object.entries(hiddenParams).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Period</label>
          <select name="period" defaultValue={period} onChange={submitOnChange} className={selectCls}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Department</label>
          <select name="overviewDepartment" defaultValue={department ?? ''} onChange={submitOnChange} className={selectCls}>
            <option value="">All departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Category</label>
          <select name="category" defaultValue={categoryCode ?? ''} onChange={submitOnChange} className={selectCls}>
            <option value="">All categories</option>
            {SCORECARD_ITEMS.map((i) => <option key={i.code} value={i.code}>{`${i.code} — ${i.label}`}</option>)}
          </select>
        </div>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={tileCls}>
          <div className="flex items-center justify-between mb-3">
            <div className="bg-blue-500 rounded-lg p-2"><ClipboardCheck className="w-5 h-5 text-white" /></div>
            <span className="text-3xl font-bold text-gray-900 dark:text-white">{stats.total}</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Total Done</p>
        </div>
        <div className={tileCls}>
          <div className="flex items-center justify-between mb-3">
            <div className="bg-green-500 rounded-lg p-2"><CheckCircle2 className="w-5 h-5 text-white" /></div>
            <span className="text-3xl font-bold text-gray-900 dark:text-white">{stats.successRate}%</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Success Rate</p>
        </div>
        <div className={tileCls}>
          <div className="flex items-center justify-between mb-3">
            <div className="bg-red-500 rounded-lg p-2"><XCircle className="w-5 h-5 text-white" /></div>
            <span className="text-3xl font-bold text-gray-900 dark:text-white">{stats.flopRate}%</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Flop Rate</p>
        </div>
      </div>
    </div>
  )
}
