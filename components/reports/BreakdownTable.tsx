import { BreakdownRow } from '@/lib/reports/t2QueueBreakdown'
import { sectionTitleCls, tableHeadCls, tableCellCls, tableRowBorderCls } from './theme'

export default function BreakdownTable({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <div>
      <div className={`${sectionTitleCls} mb-2`}>{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-gray-400 dark:text-gray-500">No data for this period.</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className={`${tableHeadCls} py-1.5 pr-4`}>{title}</th>
              <th className={`${tableHeadCls} py-1.5 pr-4`}>Volume</th>
              <th className={`${tableHeadCls} py-1.5`}>%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value} className={tableRowBorderCls}>
                <td className={`${tableCellCls} py-1.5 pr-4`}>{row.value}</td>
                <td className={`${tableCellCls} py-1.5 pr-4`}>{row.volume.toLocaleString()}</td>
                <td className={`${tableCellCls} py-1.5`}>{Math.round(row.pct)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
