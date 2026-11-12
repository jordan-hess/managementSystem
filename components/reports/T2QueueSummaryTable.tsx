import { QueueSummaryRow } from '@/lib/reports/t2QueueSummary'
import { cardCls, cardPad, sectionTitleCls, tableHeadCls, tableCellCls, tableRowBorderCls } from './theme'

export default function T2QueueSummaryTable({ rows }: { rows: QueueSummaryRow[] }) {
  return (
    <div className={`${cardCls} ${cardPad}`}>
      <div className={`${sectionTitleCls} mb-3`}>T2 Ops Queue Summary</div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className={`${tableHeadCls} py-2 pr-4`}>Queue</th>
              <th className={`${tableHeadCls} py-2 pr-4`}>Volume</th>
              <th className={`${tableHeadCls} py-2 pr-4`}>% of T2</th>
              <th className={`${tableHeadCls} py-2 pr-4`}>Open</th>
              <th className={`${tableHeadCls} py-2 pr-4`}>Resolved</th>
              <th className={`${tableHeadCls} py-2`}>Escalated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.queue} className={tableRowBorderCls}>
                <td className={`${tableCellCls} py-2 pr-4 font-medium`}>{row.queue}</td>
                <td className={`${tableCellCls} py-2 pr-4`}>{row.volume.toLocaleString()}</td>
                <td className={`${tableCellCls} py-2 pr-4`}>{Math.round(row.pctOfT2)}%</td>
                <td className={`${tableCellCls} py-2 pr-4`}>{row.open.toLocaleString()}</td>
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
