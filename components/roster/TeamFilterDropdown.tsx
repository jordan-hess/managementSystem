'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Users, X } from 'lucide-react'
import { groupTeamsByDepartment, type GridTeam } from '@/lib/roster/gridGroups'

interface TeamFilterDropdownProps {
  teams: GridTeam[]
  selectedTeamIds: Set<string>
  onChange: (next: Set<string>) => void
}

/** Multi-select team filter, teams grouped under their department. Empty selection = all teams. */
export default function TeamFilterDropdown({ teams, selectedTeamIds, onChange }: TeamFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const groups = groupTeamsByDepartment(teams)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selectedTeams = teams.filter(t => selectedTeamIds.has(t.id))
  const label = selectedTeams.length === 0
    ? 'All Teams'
    : selectedTeams.length === 1
      ? selectedTeams[0].name
      : `${selectedTeams.length} teams`

  function toggleTeam(id: string) {
    const next = new Set(selectedTeamIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  function toggleDepartment(deptTeams: GridTeam[]) {
    const next = new Set(selectedTeamIds)
    const allSelected = deptTeams.every(t => next.has(t.id))
    for (const t of deptTeams) {
      if (allSelected) next.delete(t.id)
      else next.add(t.id)
    }
    onChange(next)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Filter by team"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
        >
          <Users className="w-4 h-4 text-gray-400" />
          {label}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 z-30 mt-2 w-72 max-h-96 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-2">
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              All Teams
              {selectedTeamIds.size === 0 && <Check className="w-4 h-4 text-blue-600" />}
            </button>

            {groups.map(({ department, teams: deptTeams }) => {
              const allSelected = deptTeams.every(t => selectedTeamIds.has(t.id))
              return (
                <div key={department} className="mt-2">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{department}</span>
                    <button
                      type="button"
                      onClick={() => toggleDepartment(deptTeams)}
                      className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {allSelected ? 'Clear' : 'Select all'}
                    </button>
                  </div>
                  {deptTeams.map(team => {
                    const checked = selectedTeamIds.has(team.id)
                    return (
                      <label
                        key={team.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTeam(team.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {team.name}
                      </label>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedTeams.map(team => (
        <span
          key={team.id}
          className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs font-medium rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
        >
          {team.name}
          <button
            type="button"
            onClick={() => toggleTeam(team.id)}
            aria-label={`Remove ${team.name}`}
            className="p-0.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-800"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  )
}
