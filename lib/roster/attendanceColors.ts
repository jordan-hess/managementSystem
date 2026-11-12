import { Clock, Thermometer, XCircle, MinusCircle, type LucideIcon } from 'lucide-react'

// A separate, purpose-built palette for the redesigned agent-facing roster —
// deliberately NOT an edit to teamColors.ts's statusColorClasses, which is
// also consumed by the untouched RosterGridView.tsx (must stay pixel-
// identical) and whose late=yellow/leave=purple don't match what was asked
// for here (Late=amber, Sick=orange, Absent=red, Other=grey). 'leave' is
// treated as the "Other applicable attendance statuses" catch-all.
export const attendanceColorClasses: Record<string, { bg: string; text: string }> = {
  on_shift:    { bg: 'bg-green-100 dark:bg-green-900/40',  text: 'text-green-700 dark:text-green-400'  },
  late:        { bg: 'bg-amber-100 dark:bg-amber-900/40',  text: 'text-amber-700 dark:text-amber-400'  },
  sick:        { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-400' },
  absent:      { bg: 'bg-red-100 dark:bg-red-900/40',      text: 'text-red-700 dark:text-red-400'      },
  leave:       { bg: 'bg-gray-200 dark:bg-gray-700/60',    text: 'text-gray-700 dark:text-gray-300'    },
  off:         { bg: 'bg-gray-100 dark:bg-gray-800',       text: 'text-gray-500 dark:text-gray-400'    },
  no_rotation: { bg: 'bg-gray-50 dark:bg-gray-800/50',     text: 'text-gray-400 dark:text-gray-500'    },
}

// Every anomaly status is paired with an icon so it's never color-only.
export const attendanceIcons: Partial<Record<string, LucideIcon>> = {
  late: Clock,
  sick: Thermometer,
  absent: XCircle,
  leave: MinusCircle,
}

/** The 4 anomaly statuses the weekly attendance view cares about — on_shift/off/no_rotation are normal, not anomalies. */
export const ANOMALY_STATUSES = ['late', 'sick', 'absent', 'leave'] as const

export const attendanceLegend: { status: (typeof ANOMALY_STATUSES)[number]; label: string }[] = [
  { status: 'late', label: 'Late' },
  { status: 'sick', label: 'Sick / Sick Leave' },
  { status: 'absent', label: 'Absent' },
  { status: 'leave', label: 'Other' },
]

/**
 * Sub-colors a plain working day by the shift's is_late_shift flag — any
 * flagged attendance status (late/sick/leave/absent/off) always keeps its
 * own attendanceColorClasses entry instead of this, since that's a more
 * specific signal. Shared by RosterGridView.tsx (admin/management/TL-leader
 * grid) and AgentMonthCalendar.tsx (an agent's own calendar) so an on-shift
 * day's color is consistent across both views — early stays green, a late
 * shift (e.g. an 11:00 start) is blue.
 */
export function shiftTimeColorClasses(isLateShift: boolean): { bg: string; text: string } {
  return isLateShift
    ? { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-400' }
    : { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-400' }
}
