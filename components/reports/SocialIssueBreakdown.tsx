import BreakdownTable from './BreakdownTable'
import { QueueBreakdownData } from '@/lib/reports/t2QueueBreakdown'
import { cardCls, cardPad, sectionTitleCls } from './theme'

export default function SocialIssueBreakdown({ data }: { data: QueueBreakdownData }) {
  return (
    <div className={`${cardCls} ${cardPad}`}>
      <div className={`${sectionTitleCls} mb-4`}>Social Issue Breakdown</div>
      <div className={`grid gap-6 ${data.secondary ? 'sm:grid-cols-2' : ''}`}>
        <BreakdownTable title={data.primary.label} rows={data.primary.rows} />
        {data.secondary && <BreakdownTable title={data.secondary.label} rows={data.secondary.rows} />}
      </div>
    </div>
  )
}
