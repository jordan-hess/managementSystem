'use client'

import { cardCls, mutedTextCls, sectionTitleCls, tableHeadCls } from '@/components/reports/theme'
import type { ManagerMonthlyReview } from '@/lib/leadops/types'
import { MANAGER_RAG_CLS, MANAGER_RAG_LABELS, badgeCls } from '../statusStyles'

interface Props {
  reviews: ManagerMonthlyReview[]
}

/** Prior months, read from each locked review's frozen snapshot — never recomputed, so history doesn't silently change if mock TL data is edited later. */
export default function HistoryTable({ reviews }: Props) {
  const locked = reviews.filter((r) => r.status === 'locked' && r.locked_snapshot).sort((a, b) => (a.month < b.month ? 1 : -1))

  if (locked.length === 0) {
    return (
      <div className={`${cardCls} p-5`}>
        <h2 className={sectionTitleCls}>History</h2>
        <p className={`${mutedTextCls} mt-1`}>No locked months yet — history appears here once a month&apos;s review is locked.</p>
      </div>
    )
  }

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className={sectionTitleCls}>History</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={tableHeadCls}>
              <th className="px-4 py-2">Month</th>
              <th className="px-4 py-2">Overall</th>
              <th className="px-4 py-2">RAG</th>
            </tr>
          </thead>
          <tbody>
            {locked.map((r) => {
              const snap = r.locked_snapshot!
              return (
                <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2 text-gray-900 dark:text-white">{r.month}</td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{snap.overallPct === null ? '—' : `${snap.overallPct}%`}</td>
                  <td className="px-4 py-2">
                    <span className={`${badgeCls} ${MANAGER_RAG_CLS[snap.rag]}`}>{MANAGER_RAG_LABELS[snap.rag]}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
