'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cardCls, mutedTextCls, sectionTitleCls, tableHeadCls } from '@/components/reports/theme'
import { resolveTeamSizeForMonth } from '@/lib/leadops/managerScoring'
import type { MockTeamLeader, TlTeamSize } from '@/lib/leadops/types'
import { badgeCls, btnPrimary, inputCls } from '../statusStyles'

interface Props {
  teamLeaders: MockTeamLeader[]
  teamSizes: TlTeamSize[]
  month: string
  canEdit: boolean
  onSave: (row: TlTeamSize) => void
}

/**
 * One row per TL — the agent headcount the department roll-up weights by.
 * Pre-filled from the latest prior month and shown "Unconfirmed" until
 * explicitly saved for THIS month — team size genuinely varies TL to TL and
 * month to month, so carrying last month's figure forward silently would be
 * wrong, not just stale.
 */
export default function TeamSizePanel({ teamLeaders, teamSizes, month, canEdit, onSave }: Props) {
  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className={sectionTitleCls}>Team size — {month}</h2>
        <p className={mutedTextCls}>The department roll-up weights each team leader by this count. Pre-filled from the prior month; confirm it&apos;s still accurate.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={tableHeadCls}>
              <th className="px-4 py-2">Team leader</th>
              <th className="px-4 py-2">Agent count</th>
              <th className="px-4 py-2">Status</th>
              {canEdit && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {teamLeaders.map((tl) => (
              <TeamSizeRow
                key={tl.id}
                tl={tl}
                resolved={resolveTeamSizeForMonth(tl.id, month, teamSizes)}
                month={month}
                canEdit={canEdit}
                onSave={onSave}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TeamSizeRow({
  tl, resolved, month, canEdit, onSave,
}: { tl: MockTeamLeader; resolved: ReturnType<typeof resolveTeamSizeForMonth>; month: string; canEdit: boolean; onSave: (row: TlTeamSize) => void }) {
  const [value, setValue] = useState(String(resolved?.agent_count ?? ''))
  const [saved, setSaved] = useState(false)

  function save() {
    const n = Number(value)
    if (Number.isNaN(n) || n < 0) return
    onSave({ tl_id: tl.id, month, agent_count: n, confirmed: true })
    setSaved(true)
  }

  return (
    <tr className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-4 py-2.5 text-gray-900 dark:text-white">{tl.full_name}</td>
      <td className="px-4 py-2.5">
        {canEdit ? (
          <input type="number" min={0} value={value} onChange={(e) => { setValue(e.target.value); setSaved(false) }} className={`${inputCls} w-24`} />
        ) : (
          <span className="text-gray-900 dark:text-white">{resolved?.agent_count ?? '—'}</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {!resolved ? (
          <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400`}>No data</span>
        ) : resolved.confirmed ? (
          <span className={`${badgeCls} bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400`}><CheckCircle2 className="w-3 h-3" /> Confirmed</span>
        ) : (
          <span className={`${badgeCls} bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400`}><AlertTriangle className="w-3 h-3" /> Unconfirmed</span>
        )}
      </td>
      {canEdit && (
        <td className="px-4 py-2.5 text-right">
          {saved ? <span className="text-xs text-green-700 dark:text-green-400">Saved</span> : (
            <button type="button" onClick={save} className={`${btnPrimary} !px-2.5 !py-1 text-xs`}>Save</button>
          )}
        </td>
      )}
    </tr>
  )
}
