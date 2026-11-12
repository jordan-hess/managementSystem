'use client'

import Modal from '@/components/ui/Modal'
import { mutedTextCls, tableHeadCls } from '@/components/reports/theme'
import { EFFICIENCY_METRIC_DEFS } from '@/lib/leadops/constants'
import { buildScoredKpi, formatThreshold } from '@/lib/leadops/scoring'
import type { EfficiencyScore, ManagerKpaComputed } from '@/lib/leadops/types'
import { BAND_CLS, badgeCls } from '../statusStyles'

interface Props {
  computed: ManagerKpaComputed | null
  month: string
  scores: EfficiencyScore[]
  onClose: () => void
}

/**
 * Per-TL detail for one Roll-Up KPA: team size, weight share, this TL's
 * score, and the real per-KPI scores behind it — inline, rather than a new
 * cross-tab link into the per-TL "TL Efficiency Scorecard" tab (which is
 * HOD-only; Manager Scorecard viewers are 'management', not 'hod', and
 * widening that read grant is out of scope here — see
 * docs/manager-scorecard.md).
 */
export default function TlBreakdownDrawer({ computed, month, scores, onClose }: Props) {
  if (!computed) return null
  const sourceKeys = computed.kpa.sourceTlKpiKeys ?? []
  const defs = EFFICIENCY_METRIC_DEFS.filter((d) => sourceKeys.includes(d.key))

  return (
    <Modal open={!!computed} onClose={onClose} title={`${computed.kpa.name} — team leader breakdown`} size="4xl">
      <div className="space-y-4">
        <p className={mutedTextCls}>{computed.kpa.whatThisCovers}</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHeadCls}>
                <th className="px-3 py-2">Team leader</th>
                <th className="px-3 py-2">Team size</th>
                <th className="px-3 py-2">Weight share</th>
                <th className="px-3 py-2">This KPA</th>
              </tr>
            </thead>
            <tbody>
              {(computed.contributions ?? []).map((c) => (
                <tr key={c.tlId} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2 text-gray-900 dark:text-white">{c.tlName}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                    {c.teamSize ?? '—'}
                    {c.teamSizeMissing && <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-400">missing</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{c.weightShare === null ? '—' : `${c.weightShare}%`}</td>
                  <td className="px-3 py-2 text-gray-900 dark:text-white font-medium">{c.pct === null ? <span className="text-gray-400 dark:text-gray-500">No data</span> : `${c.pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">The underlying KPIs ({month})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  <th className="px-3 py-2">Team leader</th>
                  <th className="px-3 py-2">KPI</th>
                  <th className="px-3 py-2">Actual</th>
                  <th className="px-3 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {(computed.contributions ?? []).flatMap((c) => defs.map((def) => {
                  const kpi = buildScoredKpi(def, scores.find((s) => s.tl_id === c.tlId && s.period === month && s.metric_key === def.key))
                  return (
                    <tr key={`${c.tlId}-${def.key}`} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{c.tlName}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{def.kpi} <span className={mutedTextCls}>({formatThreshold(def.green, def)})</span></td>
                      <td className="px-3 py-2 text-gray-900 dark:text-white">
                        {kpi.isNa ? <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400`}>N/A</span>
                          : kpi.actual === null ? <span className="text-gray-400 dark:text-gray-500">—</span> : `${kpi.actual}${def.unit}`}
                      </td>
                      <td className="px-3 py-2">
                        {kpi.score === null ? <span className="text-gray-400 dark:text-gray-500">—</span>
                          : <span className={`${badgeCls} ${BAND_CLS[kpi.band as 'green' | 'amber' | 'red']}`}>{kpi.score}</span>}
                      </td>
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}
