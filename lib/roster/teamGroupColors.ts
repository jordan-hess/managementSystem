import { TeamGroup } from '@/types'

// Mirrors teamColorClasses' shape/shade convention in ./teamColors.ts, for
// the roster's two display-level groups instead of the legacy 4 named
// teams. Indigo/teal are both muted/professional and sit clear of the
// amber/orange/red/grey attendance palette (./attendanceColors.ts) so team
// color and attendance color are never confusable.
export const teamGroupColorClasses: Record<TeamGroup, {
  bg: string
  text: string
  border: string
  dot: string
  lightBg: string
}> = {
  social: { bg: 'bg-indigo-500', text: 'text-indigo-700 dark:text-indigo-400', border: 'border-indigo-300 dark:border-indigo-700', dot: 'bg-indigo-500 dark:bg-indigo-400', lightBg: 'bg-indigo-50 dark:bg-indigo-900/30' },
  t2:     { bg: 'bg-teal-500',   text: 'text-teal-700 dark:text-teal-400',     border: 'border-teal-300 dark:border-teal-700',     dot: 'bg-teal-500 dark:bg-teal-400',     lightBg: 'bg-teal-50 dark:bg-teal-900/30'     },
  mixed:  { bg: 'bg-gray-400',   text: 'text-gray-600 dark:text-gray-300',     border: 'border-gray-300 dark:border-gray-600',     dot: 'bg-gray-400 dark:bg-gray-500',     lightBg: 'bg-gray-50 dark:bg-gray-800/50'     },
}

export const teamGroupLabels: Record<TeamGroup, string> = {
  social: 'Social Team',
  t2: 'T2 Team',
  mixed: 'Mixed',
}
