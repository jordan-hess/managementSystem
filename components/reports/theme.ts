// Management Reporting Dashboard — category accent tokens, defined once and
// reused across KpiCard, VolumeOverTimeChart, and the summary tables so the
// palette (T2=blue, Social=purple, Escalated=orange, Resolved=green) never
// drifts between widgets. Hex values (not Tailwind classes) because recharts
// SVG fill/stroke props need a real color, not a class name.
export const ACCENTS = {
  total: '#6366f1',
  t2: '#3b82f6',
  social: '#a855f7',
  open: '#f59e0b',
  resolved: '#22c55e',
  escalated: '#f97316',
} as const

export const cardCls = 'bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800'
export const cardPad = 'p-4'
export const sectionTitleCls = 'font-semibold text-sm text-gray-900 dark:text-white'
export const mutedTextCls = 'text-xs text-gray-500 dark:text-gray-400'
export const tableHeadCls = 'text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide'
export const tableCellCls = 'text-sm text-gray-900 dark:text-white'
export const tableRowBorderCls = 'border-t border-gray-100 dark:border-gray-800'
