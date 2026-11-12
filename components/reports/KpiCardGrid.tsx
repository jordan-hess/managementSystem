import { KpiSummary } from '@/lib/reports/kpis'
import KpiCard from './KpiCard'
import { ACCENTS } from './theme'

export default function KpiCardGrid({ kpis }: { kpis: KpiSummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard label="Total Tickets" metric={kpis.totalTickets} accent={ACCENTS.total} />
      <KpiCard label="T2 Ops" metric={kpis.t2Ops} accent={ACCENTS.t2} />
      <KpiCard label="Social" metric={kpis.social} accent={ACCENTS.social} />
      <KpiCard label="Open" metric={kpis.open} accent={ACCENTS.open} />
      <KpiCard label="Resolved" metric={kpis.resolved} accent={ACCENTS.resolved} />
      <KpiCard label="Escalated" metric={kpis.escalated} accent={ACCENTS.escalated} />
    </div>
  )
}
