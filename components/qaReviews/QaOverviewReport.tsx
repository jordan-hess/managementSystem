'use client'

import type { Department } from '@/lib/departments'
import { DEPARTMENT_LABELS } from '@/lib/qa/constants'
import type { QaOverviewReport as Report, PassRateStats } from '@/lib/qa/overviewReport'
import ExportReviewsButton from './ExportReviewsButton'
import { cardCls, cardPad, sectionTitleCls, mutedTextCls, tableHeadCls, tableCellCls, tableRowBorderCls } from '@/components/reports/theme'

interface Props {
  report: Report
  /** The departments shown — all three, or just the one picked in the Department filter. */
  departments: readonly Department[]
  from: string
  to: string
}

const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`)
const score = (n: number | null) => (n === null ? '—' : n.toFixed(1))
const th = `${tableHeadCls} py-1.5 pr-4`
const thRight = `${tableHeadCls} py-1.5 pr-4 text-right`
const td = `${tableCellCls} py-1.5 pr-4`
const tdRight = `${tableCellCls} py-1.5 pr-4 text-right tabular-nums`

function StatCells({ stats }: { stats: PassRateStats }) {
  return (
    <>
      <td className={tdRight}>{stats.total}</td>
      <td className={tdRight}>{pct(stats.passRate)}</td>
      <td className={tdRight}>{score(stats.averageScore)}</td>
    </>
  )
}

function StatHeads() {
  return (
    <>
      <th className={thRight}>Reviews</th>
      <th className={thRight}>Pass Rate</th>
      <th className={thRight}>Avg Score</th>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${cardCls} ${cardPad}`}>
      <div className={`${sectionTitleCls} mb-2`}>{title}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

const empty = <div className={mutedTextCls}>No reviews for this period.</div>

export default function QaOverviewReport({ report, departments, from, to }: Props) {
  const hasReviews = report.departments.some((d) => d.total > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Overview</h2>
        <ExportReviewsButton defaultFrom={from} defaultTo={to} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Overall Results">
          <table className="w-full">
            <thead><tr><th className={th}>Team</th><StatHeads /></tr></thead>
            <tbody>
              {report.departments.map((d) => (
                <tr key={d.department} className={tableRowBorderCls}>
                  <td className={td}>{DEPARTMENT_LABELS[d.department]}</td>
                  <StatCells stats={d} />
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Pass Rate by Team Leader">
          {report.teamLeaders.length === 0 ? empty : (
            <table className="w-full">
              <thead><tr><th className={th}>Team Leader</th><th className={th}>Department</th><StatHeads /></tr></thead>
              <tbody>
                {report.teamLeaders.map((t) => (
                  <tr key={`${t.department}:${t.teamLeader}`} className={tableRowBorderCls}>
                    <td className={td}>{t.teamLeader}</td>
                    <td className={td}>{DEPARTMENT_LABELS[t.department]}</td>
                    <StatCells stats={t} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title="Root Cause Comparison">
        {report.rootCauses.length === 0 ? empty : (
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Root Cause</th>
                {departments.map((d) => <th key={d} className={thRight}>{DEPARTMENT_LABELS[d]}</th>)}
                <th className={thRight}>Combined</th>
              </tr>
            </thead>
            <tbody>
              {report.rootCauses.map((r) => (
                <tr key={r.name} className={tableRowBorderCls}>
                  <td className={td}>{r.name}</td>
                  {departments.map((d) => (
                    <td key={d} className={`${tdRight} ${r.counts[d] === 0 ? 'text-gray-400 dark:text-gray-600' : ''}`}>{r.counts[d]}</td>
                  ))}
                  <td className={`${tdRight} font-semibold`}>{r.combined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className={`grid grid-cols-1 ${departments.length > 1 ? 'lg:grid-cols-3' : ''} gap-4`}>
        {departments.map((d) => (
          <Section key={d} title={`${DEPARTMENT_LABELS[d]} — Category Pass Rate`}>
            {report.categories[d].length === 0 ? empty : (
              <table className="w-full">
                <thead><tr><th className={th}>Category</th><th className={thRight}>Reviews</th><th className={thRight}>Pass Rate</th></tr></thead>
                <tbody>
                  {report.categories[d].map((c) => (
                    <tr key={c.category} className={tableRowBorderCls}>
                      <td className={td}>{c.category}</td>
                      <td className={tdRight}>{c.total}</td>
                      <td className={tdRight}>{pct(c.passRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        ))}
      </div>

      {!hasReviews && <p className={mutedTextCls}>No rated reviews in this period yet — the tables fill in as reviews are completed.</p>}
    </div>
  )
}
