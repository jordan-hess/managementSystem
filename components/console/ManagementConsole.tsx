'use client'

import { AttendanceStatus, TeamMember, TeamRotation, AttendanceRecord, RosterOverride } from '@/types'
import { buildSlotMap } from '@/lib/roster/resolveShift'
import { statusColorClasses, statusLabels } from '@/lib/roster/teamColors'
import AttendanceCategoryRow from './AttendanceCategoryRow'

type PersonLite = { id: string; full_name: string }

export interface ManagementConsoleProps {
  agents: PersonLite[]
  teamMembers: TeamMember[]
  teamRotations: TeamRotation[]
  attendanceRecords: AttendanceRecord[]
  rosterOverrides: RosterOverride[]
  leaders: PersonLite[]
  todayIso: string
}

const AGENT_CATEGORIES: AttendanceStatus[] = ['on_shift', 'late', 'absent', 'sick', 'leave', 'off']

// 'YYYY-MM-DD' strings parsed via `new Date(str)` are read as UTC midnight, which can
// roll back a calendar day in negative-UTC-offset timezones — build a local date
// explicitly instead, matching lib/roster/calendarUtils.ts's own helpers.
function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function ManagementConsole({
  agents, teamMembers, teamRotations, attendanceRecords, rosterOverrides, leaders, todayIso,
}: ManagementConsoleProps) {
  const today = parseIsoDateLocal(todayIso)
  const slotMap = buildSlotMap(agents, [today], teamMembers, teamRotations, attendanceRecords, rosterOverrides)

  const buckets: Record<AttendanceStatus, PersonLite[]> = {
    on_shift: [], late: [], absent: [], sick: [], leave: [], off: [],
  }
  for (const agent of agents) {
    const slot = slotMap.get(`${agent.id}:${todayIso}`)
    const status: AttendanceStatus = !slot || slot.effectiveStatus === 'no_rotation' ? 'off' : slot.effectiveStatus
    buckets[status].push(agent)
  }

  const leadersOnShift = leaders.filter(leader => {
    const record = attendanceRecords.find(r => r.profile_id === leader.id)
    return !record || record.status === 'on_shift'
  })

  const totalStaff = agents.length + leaders.length

  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Total Staff</p>
        <p className="text-lg font-bold text-gray-900 dark:text-white">{totalStaff}</p>
      </div>

      <div className="space-y-1.5">
        {AGENT_CATEGORIES.map(status => (
          <AttendanceCategoryRow
            key={status}
            label={statusLabels[status]}
            colorClasses={statusColorClasses[status]}
            people={buckets[status]}
          />
        ))}
      </div>

      <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
        <AttendanceCategoryRow
          label="Team Leaders on Shift"
          colorClasses={statusColorClasses.on_shift}
          people={leadersOnShift}
        />
      </div>
    </div>
  )
}
