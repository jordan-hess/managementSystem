'use client'

import { AlertTriangle, Lock } from 'lucide-react'
import { mutedTextCls, tableHeadCls } from '@/components/reports/theme'
import type { ManagerKpaComputed } from '@/lib/leadops/types'
import { badgeCls } from '../statusStyles'

interface Props {
  kpas: ManagerKpaComputed[]
  onViewBreakdown: (kpa: ManagerKpaComputed) => void
}

/**
 * KPA / Method / Weight / Score% / Applicable / Redistributed weight /
 * Contribution — Roll-Up rows are always read-only (Lock icon, same
 * convention as ScorecardTab.tsx's derived KPIs), since no role may
 * hand-edit a calculated value. A Rated row's score comes from
 * MonthlyReviewForm instead, shown here read-only too.
 */
export default function KpaTable({ kpas, onViewBreakdown }: Props) {
  const totalWeight = kpas.reduce((sum, k) => sum + k.kpa.weight, 0)
  const applicableWeight = kpas.filter((k) => k.scorePct !== null).reduce((sum, k) => sum + k.kpa.weight, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className={tableHeadCls}>
            <th className="px-4 py-2.5">KPA</th>
            <th className="px-4 py-2.5">Method</th>
            <th className="px-4 py-2.5">Weight</th>
            <th className="px-4 py-2.5">Score</th>
            <th className="px-4 py-2.5">Applicable</th>
            <th className="px-4 py-2.5">Redistributed weight</th>
            <th className="px-4 py-2.5">Contribution</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {kpas.map((computed) => {
            const applicable = computed.scorePct !== null
            const redistributedWeight = applicable && applicableWeight > 0
              ? Math.round((computed.kpa.weight / applicableWeight) * 10000) / 100
              : 0
            const contribution = applicable ? Math.round((computed.scorePct as number) * (redistributedWeight / 100) * 100) / 100 : 0

            return (
              <tr key={computed.kpa.key} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 align-top">
                <td className="px-4 py-2.5">
                  <div className="text-gray-900 dark:text-white font-medium">{computed.kpa.rank}. {computed.kpa.name}</div>
                  {computed.kpa.sourceTlKpaLabel && <div className={mutedTextCls}>Source: {computed.kpa.sourceTlKpaLabel}</div>}
                  {computed.usedEqualWeightFallback && (
                    <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" /> Team size missing — equal-weight mean used
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{computed.kpa.method === 'rollup' ? 'Roll-Up' : 'Rated'}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{computed.kpa.weight}%</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 text-gray-900 dark:text-white font-medium" title={computed.kpa.method === 'rollup' ? 'Computed from the department’s team leader data' : undefined}>
                    {computed.kpa.method === 'rollup' && <Lock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />}
                    {computed.scorePct === null ? '—' : `${computed.scorePct}%`}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {applicable ? (
                    <span className={`${badgeCls} bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400`}>Yes</span>
                  ) : (
                    <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400`}>No data</span>
                  )}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{applicable ? `${redistributedWeight}%` : '—'}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{applicable ? `${contribution}pts` : '—'}</td>
                <td className="px-4 py-2.5">
                  {computed.kpa.method === 'rollup' && (
                    <button type="button" onClick={() => onViewBreakdown(computed)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium whitespace-nowrap">
                      View TL breakdown
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className={`${mutedTextCls} px-1 pt-2`}>Weights sum to {totalWeight}%.</p>
    </div>
  )
}
