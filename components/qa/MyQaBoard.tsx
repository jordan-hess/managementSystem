import Link from 'next/link'
import { format } from 'date-fns'
import { CheckCircle2, Circle } from 'lucide-react'
import { WeekGroup } from '@/lib/qa/weekBuckets'
import { ASSESSMENTS_PER_WEEK_TARGET } from '@/lib/qa/weekBuckets'
import { MyQaReviewRow, MyOpenCoachingActionRow } from '@/lib/qa/reviewPageData'
import MyQaReviewCard from './MyQaReviewCard'

const COLUMN_BG = [
  'bg-gray-50 dark:bg-gray-900/40',
  'bg-blue-50/60 dark:bg-blue-950/20',
  'bg-purple-50/60 dark:bg-purple-950/20',
  'bg-pink-50/60 dark:bg-pink-950/20',
  'bg-amber-50/60 dark:bg-amber-950/20',
]

const STATUS_LABEL: Record<MyOpenCoachingActionRow['status'], string> = {
  open: 'Open', in_progress: 'In Progress', completed: 'Completed',
}
const STATUS_BADGE_CLS: Record<MyOpenCoachingActionRow['status'], string> = {
  open: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  in_progress: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
}

interface Props {
  weekGroups: WeekGroup<MyQaReviewRow>[]
  openCoachingActions: MyOpenCoachingActionRow[]
}

export default function MyQaBoard({ weekGroups, openCoachingActions }: Props) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {weekGroups.map((group, i) => {
        const metTarget = group.reviews.length >= ASSESSMENTS_PER_WEEK_TARGET
        return (
          <div key={group.weekNumber} className={`w-72 shrink-0 rounded-xl p-3 space-y-3 ${COLUMN_BG[i % COLUMN_BG.length]}`}>
            <div className="flex items-center justify-between px-1">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Week {group.weekNumber}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Days {group.startDay}–{group.endDay}</p>
              </div>
              <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                metTarget
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}>
                {metTarget ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                {group.reviews.length} of {ASSESSMENTS_PER_WEEK_TARGET}
              </span>
            </div>

            <div className="space-y-2">
              {group.reviews.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No reviews this week</p>
              ) : (
                group.reviews.map((review) => <MyQaReviewCard key={review.id} review={review} />)
              )}
            </div>
          </div>
        )
      })}

      <div className="w-72 shrink-0 rounded-xl p-3 space-y-3 bg-green-50/60 dark:bg-green-950/20">
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Coaching Actions</p>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {openCoachingActions.length} open
          </span>
        </div>

        <div className="space-y-2">
          {openCoachingActions.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No open coaching actions</p>
          ) : (
            openCoachingActions.map((action) => (
              <Link
                key={action.id}
                href={`/qa-reviews/${action.review_id}`}
                className="block bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-3 space-y-1.5 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{action.category}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE_CLS[action.status]}`}>
                    {STATUS_LABEL[action.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">{action.required_action}</p>
                {action.due_date && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Due {format(new Date(action.due_date + 'T00:00:00'), 'd MMM')}
                  </p>
                )}
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
