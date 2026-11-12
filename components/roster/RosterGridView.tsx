'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, GitPullRequest } from 'lucide-react'
import { ResolvedDaySlot } from '@/types'
import { getDaysInMonth, formatDateKey, getIsoDayOfWeek, isToday } from '@/lib/roster/calendarUtils'
import { statusColorClasses, statusLabels } from '@/lib/roster/teamColors'
import { shiftTimeColorClasses } from '@/lib/roster/attendanceColors'
import { PresenceInfo } from '@/lib/roster/presence'
import { buildGridSections, type GridSection, type GridTeam } from '@/lib/roster/gridGroups'
import PresenceDot from './PresenceDot'
import OverrideNoteHover from './OverrideNoteHover'
import TeamFilterDropdown from './TeamFilterDropdown'

const DAY_SHORT: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }

interface RosterGridViewProps {
  currentDate: Date
  onNavigate: (dir: -1 | 1) => void
  onToday: () => void
  onJumpToMonth: (date: Date) => void
  allProfiles: { id: string; full_name: string; is_active: boolean; department?: string | null; t2_team?: string | null; team_department?: string | null }[]
  slotMap: Map<string, ResolvedDaySlot>
  /** Omitted for a viewer who can see this grid but can't mark attendance (e.g. admin — management/hod-only). */
  onMarkAttendance?: (profileId: string, date: string) => void
  /** Omit for a view-only grid (e.g. qa_analyst) — hides the per-cell override button. */
  onOverride?: (profileId: string, date: string) => void
  pendingLeaveMap?: Map<string, string[]>
  presenceMap: Map<string, PresenceInfo>
  /** With teamIdByProfile, agents are grouped under their team and a team filter is shown; omit both for a flat list (e.g. the Team Leaders grid). */
  teams?: GridTeam[]
  teamIdByProfile?: Map<string, string>
}

type GridProfile = RosterGridViewProps['allProfiles'][number]

export default function RosterGridView({
  currentDate, onNavigate, onToday, onJumpToMonth, allProfiles, slotMap, onMarkAttendance, onOverride, pendingLeaveMap, presenceMap, teams, teamIdByProfile,
}: RosterGridViewProps) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const days = useMemo(() => getDaysInMonth(year, month), [year, month])

  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())

  const grouped = !!teams && !!teamIdByProfile
  const sections: GridSection<GridProfile>[] = useMemo(() => {
    const active = allProfiles.filter(p => p.is_active)
    return teams && teamIdByProfile
      ? buildGridSections(active, teams, teamIdByProfile, selectedTeamIds)
      : [{ key: 'all', department: '', team: null, agents: active }]
  }, [allProfiles, teams, teamIdByProfile, selectedTeamIds])
  const visibleCount = sections.reduce((n, s) => n + s.agents.length, 0)

  const monthLabel = currentDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
  const monthInputValue = `${year}-${String(month + 1).padStart(2, '0')}`

  function handleJumpToMonth(value: string) {
    if (!value) return
    const [y, m] = value.split('-').map(Number)
    onJumpToMonth(new Date(y, m - 1, 1))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate(-1)}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onToday}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => onNavigate(1)}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white ml-1">{monthLabel}</h2>
          {/* Jumps straight to any month/year in one action — reachable
              today only via clicking Prev/Next repeatedly, which made
              browsing far ahead or into past years impractical. */}
          <input
            type="month"
            value={monthInputValue}
            onChange={e => handleJumpToMonth(e.target.value)}
            aria-label="Jump to month"
            title="Jump to month"
            className="ml-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        {teams && teamIdByProfile && (
          <TeamFilterDropdown teams={teams} selectedTeamIds={selectedTeamIds} onChange={setSelectedTeamIds} />
        )}
      </div>

      {/* Bounded height + overflow-auto (not just overflow-x-auto) on
          purpose: the sticky weekday header below sticks relative to this
          box's own scroll, so this box needs a real, visible scrollbar of
          its own rather than growing to the page's full height. */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-auto max-h-[70vh]">
        {/* border-separate, not border-collapse: Chromium silently ignores
            `position: sticky` on <th>/<td> when a table uses border-collapse,
            which is what the sticky weekday header below relies on. */}
        <table className="text-sm border-separate border-spacing-0" style={{ minWidth: `${160 + days.length * 68}px` }}>
          <thead>
            <tr className="bg-blue-600 dark:bg-blue-700">
              <th className="sticky left-0 top-0 z-20 bg-blue-600 dark:bg-blue-700 text-white text-xs font-semibold px-2 py-2 w-10 h-9 text-center">#</th>
              <th className="sticky left-10 top-0 z-20 bg-blue-600 dark:bg-blue-700 text-white text-xs font-semibold px-3 py-2 text-left w-40 h-9">Agent</th>
              {days.map(day => {
                const dateStr = formatDateKey(day)
                const today = isToday(day)
                const hasPendingLeave = (pendingLeaveMap?.get(dateStr)?.length ?? 0) > 0
                return (
                  <th key={dateStr} className="sticky top-0 z-10 bg-blue-600 dark:bg-blue-700 text-white text-xs font-semibold px-1 py-2 text-center w-17 h-9">
                    <span className={today ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-blue-700' : ''}>
                      {day.getDate()}
                    </span>
                    {hasPendingLeave && (
                      <span title="Pending leave requests" className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                    )}
                  </th>
                )
              })}
            </tr>
            <tr className="bg-blue-500 dark:bg-blue-800">
              <th className="sticky left-0 top-9 z-20 bg-blue-500 dark:bg-blue-800" />
              <th className="sticky left-10 top-9 z-20 bg-blue-500 dark:bg-blue-800" />
              {days.map(day => {
                const isoDow = getIsoDayOfWeek(day)
                return (
                  <th
                    key={formatDateKey(day)}
                    className={`sticky top-9 z-10 bg-blue-500 dark:bg-blue-800 text-xs font-medium px-1 py-1 text-center ${isoDow >= 6 ? 'text-blue-100' : 'text-blue-50'}`}
                  >
                    {DAY_SHORT[isoDow]}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {sections.flatMap((section, sectionIdx) => {
              const offset = sections.slice(0, sectionIdx).reduce((n, s) => n + s.agents.length, 0)
              const header = grouped ? (
                <tr key={`${section.key}-header`}>
                  <td colSpan={days.length + 2} className="sticky left-0 bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
                    {section.team ? (
                      <>
                        <span className="font-medium text-gray-400 dark:text-gray-500">{section.department} · </span>
                        {section.team.name}
                      </>
                    ) : 'Unassigned'}
                    <span className="ml-2 font-normal text-gray-400 dark:text-gray-500">({section.agents.length})</span>
                  </td>
                </tr>
              ) : null
              return [header, ...section.agents.map((profile, i) => {
                const idx = offset + i
                return (
              <tr key={profile.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/40 px-2 py-1.5 text-center text-xs text-gray-400 dark:text-gray-500">
                  {idx + 1}
                </td>
                <td className="sticky left-10 z-10 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/40 px-3 py-1.5 text-xs font-medium text-gray-900 dark:text-white whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    {presenceMap.get(profile.id) && <PresenceDot info={presenceMap.get(profile.id)!} />}
                    {profile.full_name}
                  </span>
                </td>
                {days.map(day => {
                  const dateStr = formatDateKey(day)
                  const slot = slotMap.get(`${profile.id}:${dateStr}`)
                  const sc = !slot || slot.effectiveStatus === 'no_rotation'
                    ? statusColorClasses.no_rotation
                    : slot.effectiveStatus === 'on_shift' && slot.shiftTemplate
                      ? shiftTimeColorClasses(slot.shiftTemplate.is_late_shift)
                      : (statusColorClasses[slot.effectiveStatus] ?? statusColorClasses.off)

                  const label = !slot
                    ? '—'
                    : slot.effectiveStatus === 'on_shift' && slot.shiftTemplate
                      ? slot.shiftTemplate.start_time.slice(0, 5)
                      : (statusLabels[slot.effectiveStatus] ?? '—')

                  const cell = onMarkAttendance ? (
                    <button
                      type="button"
                      onClick={() => onMarkAttendance(profile.id, dateStr)}
                      className={`w-full min-h-8 rounded-md px-1.5 py-2 text-xs font-semibold transition-opacity hover:opacity-75 ${sc.bg} ${sc.text}`}
                    >
                      {label}
                    </button>
                  ) : (
                    <div className={`w-full min-h-8 flex items-center justify-center rounded-md px-1.5 py-2 text-xs font-semibold ${sc.bg} ${sc.text}`}>
                      {label}
                    </div>
                  )

                  return (
                    <td key={dateStr} className="p-0.5 text-center">
                      <div className="relative group/cell">
                        {slot?.overrideNotes ? <OverrideNoteHover note={slot.overrideNotes}>{cell}</OverrideNoteHover> : cell}
                        {onOverride && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onOverride(profile.id, dateStr) }}
                            title="Override schedule"
                            className="absolute -top-1 -right-1 p-0.5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 opacity-0 group-hover/cell:opacity-100 transition-opacity"
                          >
                            <GitPullRequest className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
                )
              })]
            })}
            {visibleCount === 0 && (
              <tr>
                <td colSpan={days.length + 2} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  No agents match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
