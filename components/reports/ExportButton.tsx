'use client'

import { Download } from 'lucide-react'
import { KpiSummary } from '@/lib/reports/kpis'
import { QueueSummaryRow } from '@/lib/reports/t2QueueSummary'
import { ChannelSummaryRow } from '@/lib/reports/socialChannelSummary'

interface Props {
  from: string
  to: string
  kpis: KpiSummary
  t2QueueSummary: QueueSummaryRow[]
  socialChannelSummary: ChannelSummaryRow[]
}

function csvEscape(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
}

/**
 * Client-side CSV of the already-fetched summary widgets (KPI row + both
 * queue/channel tables) — no server action, no raw-ticket export, no PDF.
 * This app has no export precedent to follow, so scope is deliberately
 * minimal: a Blob download of what's already on screen.
 */
export default function ExportButton({ from, to, kpis, t2QueueSummary, socialChannelSummary }: Props) {
  function handleExport() {
    const lines: (string | number)[][] = [
      ['Management Report', `${from} to ${to}`],
      [],
      ['KPI', 'Current', 'Previous', 'Delta %'],
      ['Total Tickets', kpis.totalTickets.current, kpis.totalTickets.previous, kpis.totalTickets.deltaPct ?? ''],
      ['T2 Ops', kpis.t2Ops.current, kpis.t2Ops.previous, kpis.t2Ops.deltaPct ?? ''],
      ['Social', kpis.social.current, kpis.social.previous, kpis.social.deltaPct ?? ''],
      ['Open', kpis.open.current, kpis.open.previous, kpis.open.deltaPct ?? ''],
      ['Resolved', kpis.resolved.current, kpis.resolved.previous, kpis.resolved.deltaPct ?? ''],
      ['Escalated', kpis.escalated.current, kpis.escalated.previous, kpis.escalated.deltaPct ?? ''],
      [],
      ['T2 Queue', 'Volume', '% of T2', 'Open', 'Resolved', 'Escalated'],
      ...t2QueueSummary.map((r) => [r.queue, r.volume, Math.round(r.pctOfT2), r.open, r.resolved, r.escalated]),
      [],
      ['Social Channel', 'Volume', '% of Social', 'Resolved', 'Escalated'],
      ...socialChannelSummary.map((r) => [r.channel, r.volume, Math.round(r.pctOfSocial), r.resolved, r.escalated]),
    ]

    const blob = new Blob([toCsv(lines)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `management-report_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      title="Export the current view as CSV"
      className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      <Download className="w-4 h-4" /> Export
    </button>
  )
}
