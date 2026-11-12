import { ReportFilters } from '@/lib/reports/filters'
import { KpiSummary } from '@/lib/reports/kpis'
import { VolumePoint, Granularity } from '@/lib/reports/volumeOverTime'
import { QueueSummaryRow } from '@/lib/reports/t2QueueSummary'
import { ChannelSummaryRow } from '@/lib/reports/socialChannelSummary'
import { FilterOptions } from '@/lib/reports/filterOptions'
import { resolveFilterVisibility } from '@/lib/reports/filterVisibility'
import { BillingSummary, BillingBreakdownRow } from '@/lib/reports/billingSummary'
import ReportHeader from './ReportHeader'
import FilterBar from './FilterBar'
import KpiCardGrid from './KpiCardGrid'
import VolumeOverTimeChart from './VolumeOverTimeChart'
import T2QueueSummaryTable from './T2QueueSummaryTable'
import { QueueBreakdownData } from '@/lib/reports/t2QueueBreakdown'
import T2QueueBreakdownTabs from './T2QueueBreakdownTabs'
import SocialIssueBreakdown from './SocialIssueBreakdown'
import SocialChannelSummaryTable from './SocialChannelSummaryTable'
import BillingSummarySection from './BillingSummarySection'
import KeyInsightsList from './KeyInsightsList'

interface Props {
  filters: ReportFilters
  period: string
  granularity: Granularity
  kpis: KpiSummary
  volumePoints: VolumePoint[]
  t2QueueSummary: QueueSummaryRow[]
  socialChannelSummary: ChannelSummaryRow[]
  breakdownQueue: string
  breakdownData: QueueBreakdownData
  socialBreakdownData: QueueBreakdownData
  billingSummary: BillingSummary
  billingReasonBreakdown: BillingBreakdownRow[]
  billingChannelBreakdown: BillingBreakdownRow[]
  filterOptions: FilterOptions
  insights: string[]
}

export default function ManagementReportDashboard({
  filters, period, granularity, kpis, volumePoints, t2QueueSummary, socialChannelSummary,
  breakdownQueue, breakdownData, socialBreakdownData, billingSummary, billingReasonBreakdown, billingChannelBreakdown,
  filterOptions, insights,
}: Props) {
  const visibility = resolveFilterVisibility(filters.team, filters.queue)

  return (
    <div className="space-y-4">
      <ReportHeader period={period} from={filters.from} to={filters.to} kpis={kpis} t2QueueSummary={t2QueueSummary} socialChannelSummary={socialChannelSummary} />

      <FilterBar
        team={filters.team}
        queue={filters.queue ?? ''}
        issueType={filters.issueType ?? ''}
        rootCause={filters.rootCause ?? ''}
        status={filters.status}
        filterOptions={filterOptions}
        visibility={visibility}
      />

      <KpiCardGrid kpis={kpis} />

      <VolumeOverTimeChart points={volumePoints} granularity={granularity} />

      <div className="grid gap-4 lg:grid-cols-2">
        <T2QueueSummaryTable rows={t2QueueSummary} />
        <SocialChannelSummaryTable rows={socialChannelSummary} />
      </div>

      <T2QueueBreakdownTabs activeQueue={breakdownQueue} data={breakdownData} />

      <SocialIssueBreakdown data={socialBreakdownData} />

      <BillingSummarySection summary={billingSummary} reasonBreakdown={billingReasonBreakdown} channelBreakdown={billingChannelBreakdown} />

      <KeyInsightsList insights={insights} />
    </div>
  )
}
