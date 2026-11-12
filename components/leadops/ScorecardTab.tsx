'use client'

import { Lock } from 'lucide-react'
import { cardCls, mutedTextCls, sectionTitleCls, tableHeadCls } from '@/components/reports/theme'
import { VERIFICATION_LABELS, metricsByKpa } from '@/lib/leadops/constants'
import { MOCK_PERIOD, MOCK_TEAM_LEADERS } from '@/lib/leadops/mockData'
import { aggregateScore, buildScoredKpi, formatThreshold } from '@/lib/leadops/scoring'
import { useLeadOpsData } from './LeadOpsDataProvider'
import type { EfficiencyMetricDef, EfficiencyScore } from '@/lib/leadops/types'
import { BAND_CLS, VERIFICATION_CLS, VERIFICATION_ICON, badgeCls, labelCls } from './statusStyles'

interface Props {
  /** Planner-fed actuals, keyed by metric key — read-only on this page. */
  derivedValues: Record<string, number>
}

/**
 * TL Efficiency Scorecard — HOD's READ-ONLY calculated view. Actuals,
 * N/A marks and verification all happen on Data Entry
 * (components/leadops/dataEntry/KpiActualsSection.tsx); this tab only ever
 * displays the result of lib/leadops/scoring.ts running over whatever the
 * shared store currently holds for the selected team leader.
 */
export default function ScorecardTab({ derivedValues }: Props) {
  const { scores, selectedTlId, setSelectedTlId } = useLeadOpsData()
  const tl = MOCK_TEAM_LEADERS.find((t) => t.id === selectedTlId) ?? MOCK_TEAM_LEADERS[0]

  function scoreFor(def: EfficiencyMetricDef): EfficiencyScore | undefined {
    const existing = scores.find((s) => s.tl_id === tl.id && s.period === MOCK_PERIOD && s.metric_key === def.key)
    if (existing) return existing
    if (def.inputMode === 'derived' && derivedValues[def.key] !== undefined) {
      return {
        id: `derived-${def.key}`,
        tl_id: tl.id,
        period: MOCK_PERIOD,
        metric_key: def.key,
        self_value: derivedValues[def.key],
        is_na: false,
        na_reason: null,
        verified_value: null,
        status: 'self_reported',
        verified_by: null,
        verified_at: null,
        verification_note: null,
        updated_at: '',
      }
    }
    return undefined
  }

  const allKpis = metricsByKpa().flatMap((g) => g.metrics.map((def) => buildScoredKpi(def, scoreFor(def))))
  const overall = aggregateScore(allKpis)
  const verifiedCount = allKpis.filter((k) => k.status === 'verified' && !k.isNa).length
  const naCount = allKpis.filter((k) => k.isNa).length

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="scorecard-tl">Team leader</label>
        <select
          id="scorecard-tl"
          value={selectedTlId}
          onChange={(e) => setSelectedTlId(e.target.value)}
          className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]"
        >
          {MOCK_TEAM_LEADERS.map((t) => <option key={t.id} value={t.id}>{t.full_name} — {t.team}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <SummaryTile label="Overall score" value={`${overall.achieved}/${overall.possible}`} sub={`${overall.pct}% of possible`} />
        <SummaryTile label="KPIs verified" value={`${verifiedCount}/${allKpis.length}`} sub="Verification is per-KPI" />
        <SummaryTile label="N/A" value={String(naCount)} sub="Excluded from every aggregate" />
        <SummaryTile label="Period" value={MOCK_PERIOD.slice(0, 7)} sub={`${tl.full_name} · ${tl.team} team`} />
      </div>

      {metricsByKpa().map(({ kpa, metrics }) => {
        const kpaKpis = metrics.map((def) => buildScoredKpi(def, scoreFor(def)))
        const kpaScore = aggregateScore(kpaKpis)
        const provisional = metrics.every((m) => m.provisional)

        return (
          <div key={kpa} className={`${cardCls} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className={sectionTitleCls}>{kpa}</h2>
                {provisional ? (
                  <span className={`${badgeCls} bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400`}>Provisional</span>
                ) : (
                  <span className={`${badgeCls} bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400`}>Confirmed</span>
                )}
              </div>
              <span className={mutedTextCls}>{kpaScore.achieved}/{kpaScore.possible}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className={tableHeadCls}>
                    <th className="px-4 py-2.5">KPI</th>
                    <th className="px-4 py-2.5">Green</th>
                    <th className="px-4 py-2.5">Amber</th>
                    <th className="px-4 py-2.5">Direction</th>
                    <th className="px-4 py-2.5">Actual</th>
                    <th className="px-4 py-2.5">Score</th>
                    <th className="px-4 py-2.5">Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((def) => {
                    const kpi = buildScoredKpi(def, scoreFor(def))
                    const VerIcon = VERIFICATION_ICON[kpi.status]

                    return (
                      <tr key={def.key} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 align-top">
                        <td className="px-4 py-2.5">
                          <div className="text-gray-900 dark:text-white">{def.kpi}</div>
                          <div className={`${mutedTextCls} mt-0.5`}>{def.source} · {def.frequency}</div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{formatThreshold(def.green, def)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{formatThreshold(def.amber, def)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-500 dark:text-gray-400">{def.direction === 'higher_better' ? 'Higher is better' : 'Lower is better'}</td>
                        <td className="px-4 py-2.5">
                          {kpi.isNa ? (
                            <div>
                              <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400`}>N/A</span>
                              {kpi.naReason && <p className={`${mutedTextCls} mt-0.5 max-w-xs`}>{kpi.naReason}</p>}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-gray-900 dark:text-white font-medium" title={def.inputMode === 'derived' ? 'Derived from the Time & Motion Planner' : undefined}>
                              {def.inputMode === 'derived' && <Lock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />}
                              {kpi.actual === null ? '—' : `${kpi.actual}${def.unit}`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {kpi.score === null ? (
                            <span className="text-gray-400 dark:text-gray-500">{kpi.isNa ? 'Excluded' : '—'}</span>
                          ) : (
                            <span className={`${badgeCls} ${BAND_CLS[kpi.band as 'green' | 'amber' | 'red']}`}>{kpi.score}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {!kpi.isNa && (
                            <span className={`${badgeCls} ${VERIFICATION_CLS[kpi.status]} w-fit`}>
                              <VerIcon className="w-3 h-3" />
                              {kpi.status === 'verified' ? VERIFICATION_LABELS.verified : 'Unverified'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={`${cardCls} p-5`}>
      <p className={mutedTextCls}>{label}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      <p className={`${mutedTextCls} mt-1`}>{sub}</p>
    </div>
  )
}
