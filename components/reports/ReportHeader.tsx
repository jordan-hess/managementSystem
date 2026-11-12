import { KpiSummary } from '@/lib/reports/kpis'
import { QueueSummaryRow } from '@/lib/reports/t2QueueSummary'
import { ChannelSummaryRow } from '@/lib/reports/socialChannelSummary'
import PeriodPicker from './PeriodPicker'
import ExportButton from './ExportButton'
import CustomerCareButton from './CustomerCareButton'

interface Props {
  period: string
  from: string
  to: string
  kpis: KpiSummary
  t2QueueSummary: QueueSummaryRow[]
  socialChannelSummary: ChannelSummaryRow[]
}

export default function ReportHeader({ period, from, to, kpis, t2QueueSummary, socialChannelSummary }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Management Report Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">T2 Ops and Social ticket volume, {from} to {to}</p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <PeriodPicker period={period} from={from} to={to} />
        <CustomerCareButton />
        <ExportButton from={from} to={to} kpis={kpis} t2QueueSummary={t2QueueSummary} socialChannelSummary={socialChannelSummary} />
      </div>
    </div>
  )
}
