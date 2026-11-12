import Link from 'next/link'
import { QaReviewListRow } from '@/lib/qa/reviewPageData'
import { DEPARTMENT_LABELS, LEGS_LABELS, outcomeBadgeCls } from '@/lib/qa/constants'
import DeleteReviewButton from './DeleteReviewButton'

/** `deletableIds`: review ids the viewer may delete (qaReviewCanDelete, computed server-side by the page). */
export default function ReviewTable({ rows, deletableIds = [] }: { rows: QaReviewListRow[]; deletableIds?: string[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        No QA reviews match these filters yet.
      </div>
    )
  }

  const deletable = new Set(deletableIds)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <th className="px-4 py-2.5">Agent</th>
              <th className="px-4 py-2.5">Department</th>
              <th className="px-4 py-2.5">Legs</th>
              <th className="px-4 py-2.5">Interaction date</th>
              <th className="px-4 py-2.5">Score</th>
              <th className="px-4 py-2.5">Outcome</th>
              <th className="px-4 py-2.5 w-px"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2.5">
                  <Link href={`/qa-reviews/${r.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">{r.agent_full_name}</Link>
                </td>
                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{DEPARTMENT_LABELS[r.department] ?? r.department}</td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{LEGS_LABELS[r.legs] ?? r.legs}</td>
                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{r.interaction_date}</td>
                <td className="px-4 py-2.5 text-gray-900 dark:text-white font-medium">{r.final_score === null ? '—' : `${r.final_score}%`}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${outcomeBadgeCls(r.rating_label)}`}>
                    {r.rating_label || 'Unclassified'}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {deletable.has(r.id) && <DeleteReviewButton id={r.id} agentName={r.agent_full_name} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
