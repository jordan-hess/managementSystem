'use client'

import { TeamLeaderConsoleData } from '@/types'
import { teamColorClasses } from '@/lib/roster/teamColors'
import { Users, Phone, FileText, AlertTriangle } from 'lucide-react'

interface Props {
  consoles: TeamLeaderConsoleData[]
}

const tileCls = 'bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-100 dark:border-gray-800'

export default function TeamLeaderOverviewConsole({ consoles }: Props) {
  if (consoles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          No team leaders yet — consoles appear here once a team and its leader are set up.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {consoles.map(c => {
          const colors = teamColorClasses[c.teamColor]
          return (
            <div key={c.teamId} className="bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{c.teamName}</p>
                <span className="text-xs text-gray-500 dark:text-gray-400">· {c.leaderName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className={tileCls}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{c.totalCustomers}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Total Customers</p>
                </div>
                <div className={tileCls}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Phone className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{c.pendingCallbacks}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Pending Callbacks</p>
                </div>
                <div className={tileCls}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{c.openFollowups}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Open Follow-ups</p>
                </div>
                <div className={tileCls}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{c.unreadAlerts}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Unread Alerts</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
