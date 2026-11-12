import { TrendingUp, TrendingDown } from 'lucide-react'
import { DeltaMetric } from '@/lib/reports/filters'
import { cardCls, cardPad, mutedTextCls } from './theme'

interface Props {
  label: string
  metric: DeltaMetric
  accent: string
}

export default function KpiCard({ label, metric, accent }: Props) {
  const { current, deltaPct } = metric
  const positive = deltaPct !== null && deltaPct > 0
  const negative = deltaPct !== null && deltaPct < 0

  return (
    <div className={`${cardCls} ${cardPad}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        <span className={mutedTextCls}>{label}</span>
      </div>
      <div className="text-2xl font-semibold text-gray-900 dark:text-white">{current.toLocaleString()}</div>
      <div className={`mt-1 flex items-center gap-1 text-xs ${positive ? 'text-green-600 dark:text-green-400' : negative ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {deltaPct === null ? (
          <span>New this period</span>
        ) : (
          <>
            {positive && <TrendingUp className="w-3.5 h-3.5" />}
            {negative && <TrendingDown className="w-3.5 h-3.5" />}
            <span>{deltaPct > 0 ? '+' : ''}{Math.round(deltaPct)}% vs previous period</span>
          </>
        )}
      </div>
    </div>
  )
}
