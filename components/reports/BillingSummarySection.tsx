import { BillingSummary, BillingBreakdownRow } from '@/lib/reports/billingSummary'
import BreakdownTable from './BreakdownTable'
import { cardCls, cardPad, sectionTitleCls, mutedTextCls, ACCENTS } from './theme'

interface Props {
  summary: BillingSummary
  reasonBreakdown: BillingBreakdownRow[]
  channelBreakdown: BillingBreakdownRow[]
}

/** Presentation-only: data is fetched by the dashboard page (Task 9's wiring), not here. Billing is a standalone section — plain date range, no ReportFilters team/queue machinery. */
export default function BillingSummarySection({ summary, reasonBreakdown, channelBreakdown }: Props) {
  return (
    <div className="space-y-3">
      <h3 className={sectionTitleCls}>Billing</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Volume" value={summary.volume} accent={ACCENTS.total} />
        <StatCard label="Open" value={summary.open} accent={ACCENTS.open} />
        <StatCard label="Completed" value={summary.completed} accent={ACCENTS.resolved} />
      </div>
      <div className={`${cardCls} ${cardPad} grid gap-6 sm:grid-cols-2`}>
        <BreakdownTable title="Reason for follow-up" rows={reasonBreakdown} />
        <BreakdownTable title="Channel" rows={channelBreakdown} />
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`${cardCls} ${cardPad}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        <span className={mutedTextCls}>{label}</span>
      </div>
      <div className="text-2xl font-semibold text-gray-900 dark:text-white">{value.toLocaleString()}</div>
    </div>
  )
}
