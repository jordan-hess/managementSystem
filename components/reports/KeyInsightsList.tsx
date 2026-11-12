import { Lightbulb } from 'lucide-react'
import { cardCls, cardPad, sectionTitleCls } from './theme'

export default function KeyInsightsList({ insights }: { insights: string[] }) {
  return (
    <div className={`${cardCls} ${cardPad}`}>
      <div className={`${sectionTitleCls} mb-3`}>Key Insights</div>
      {insights.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No notable patterns in this period.</p>
      ) : (
        <ul className="space-y-2.5">
          {insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
