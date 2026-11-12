import { ChannelSummaryRow } from '@/lib/reports/socialChannelSummary'
import { cardCls, cardPad, sectionTitleCls, tableHeadCls, tableCellCls, tableRowBorderCls } from './theme'

const CHANNEL_LABELS: Record<string, string> = {
  freescout: 'Freescout',
  whatsapp: 'WhatsApp',
  hellopeter: 'HelloPeter',
  mybroadband: 'MyBroadband',
  pissedcustomer: 'PissedCustomer',
}

export default function SocialChannelSummaryTable({ rows }: { rows: ChannelSummaryRow[] }) {
  return (
    <div className={`${cardCls} ${cardPad}`}>
      <div className={`${sectionTitleCls} mb-3`}>Social Channel Summary</div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className={`${tableHeadCls} py-2 pr-4`}>Channel</th>
              <th className={`${tableHeadCls} py-2 pr-4`}>Volume</th>
              <th className={`${tableHeadCls} py-2 pr-4`}>% of Social</th>
              <th className={`${tableHeadCls} py-2 pr-4`}>Resolved</th>
              <th className={`${tableHeadCls} py-2`}>Escalated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.channel} className={tableRowBorderCls}>
                <td className={`${tableCellCls} py-2 pr-4 font-medium`}>{CHANNEL_LABELS[row.channel] ?? row.channel}</td>
                <td className={`${tableCellCls} py-2 pr-4`}>{row.volume.toLocaleString()}</td>
                <td className={`${tableCellCls} py-2 pr-4`}>{Math.round(row.pctOfSocial)}%</td>
                <td className={`${tableCellCls} py-2 pr-4`}>{row.resolved.toLocaleString()}</td>
                <td className={tableCellCls + ' py-2'}>{row.escalated.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
