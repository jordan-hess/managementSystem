import { TeamColor } from '@/types'

export const teamColorClasses: Record<TeamColor, {
  bg: string
  text: string
  border: string
  dot: string
  lightBg: string
}> = {
  green:  { bg: 'bg-green-500',  text: 'text-green-700 dark:text-green-400',  border: 'border-green-300 dark:border-green-700',  dot: 'bg-green-500 dark:bg-green-400',   lightBg: 'bg-green-50 dark:bg-green-900/30'  },
  blue:   { bg: 'bg-blue-500',   text: 'text-blue-700 dark:text-blue-400',    border: 'border-blue-300 dark:border-blue-700',    dot: 'bg-blue-500 dark:bg-blue-400',     lightBg: 'bg-blue-50 dark:bg-blue-900/30'    },
  red:    { bg: 'bg-red-500',    text: 'text-red-700 dark:text-red-400',      border: 'border-red-300 dark:border-red-700',      dot: 'bg-red-500 dark:bg-red-400',       lightBg: 'bg-red-50 dark:bg-red-900/30'      },
  yellow: { bg: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-300 dark:border-yellow-700', dot: 'bg-yellow-500 dark:bg-yellow-300', lightBg: 'bg-yellow-50 dark:bg-yellow-900/30' },
}

export const statusColorClasses: Record<string, { bg: string; text: string }> = {
  on_shift:    { bg: 'bg-green-100 dark:bg-green-900/40',   text: 'text-green-700 dark:text-green-400'   },
  late:        { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-700 dark:text-yellow-400' },
  absent:      { bg: 'bg-red-100 dark:bg-red-900/40',       text: 'text-red-700 dark:text-red-400'       },
  sick:        { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-400' },
  leave:       { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-400' },
  off:         { bg: 'bg-gray-100 dark:bg-gray-800',        text: 'text-gray-500 dark:text-gray-400'     },
  no_rotation: { bg: 'bg-gray-50 dark:bg-gray-800/50',      text: 'text-gray-400 dark:text-gray-500'     },
}

export const statusLabels: Record<string, string> = {
  on_shift:    'On Shift',
  late:        'Late',
  absent:      'Absent',
  sick:        'Sick',
  leave:       'Leave',
  off:         'Off',
  no_rotation: 'No Rotation',
}
