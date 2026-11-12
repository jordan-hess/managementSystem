'use client'

import { cardCls, mutedTextCls, sectionTitleCls, tableHeadCls } from '@/components/reports/theme'
import { BAND_CLS, VERIFICATION_CLS, badgeCls } from '../statusStyles'
import type { ReviewSnapshot } from '@/lib/leadops/reviewSnapshot'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * '2026-11-03T12:20:00.000Z' -> '3 Nov, 14:20' in South African time (UTC+2, no DST). A raw Postgres timestamptz
 * ('2026-11-03 12:20:00+00') is accepted too, and anything unreadable shows a dash rather than "NaN".
 */
export function formatAsAt(iso: string): string {
  // Postgres sends 'YYYY-MM-DD HH:MM:SS+00': a T separator and a full +HH:MM offset make it strict ISO.
  const normalised = typeof iso === 'string' ? iso.replace(' ', 'T').replace(/(T[\d:.]+)([+-]\d{2})$/, '$1$2:00') : iso
  const parsed = new Date(normalised)
  if (Number.isNaN(parsed.getTime())) return '—'
  const d = new Date(parsed.getTime() + 2 * 3_600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className={mutedTextCls}>{label}</p>
    </div>
  )
}

function SnapshotV1({ snapshot }: { snapshot: ReviewSnapshot }) {
  const w = snapshot.weekly
  return (
    <div className="space-y-4">
      <p className={mutedTextCls}>Figures as at {formatAsAt(snapshot.takenAt)}</p>

      <div className={`${cardCls} p-5 space-y-3`}>
        <h3 className={sectionTitleCls}>Weekly activity · {w.weeks} {w.weeks === 1 ? 'week' : 'weeks'}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Figure label="Calibration attended" value={`${w.calibrationAttended}/${w.weeks}`} />
          <Figure label="Coaching sessions" value={String(w.coachingSessions)} />
          <Figure label="Agent-in-seat days" value={String(w.agentInSeatDays)} />
          <Figure label="Critical fails" value={String(w.criticalFails)} />
          <Figure label="Re-audits" value={String(w.reAudits)} />
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className={sectionTitleCls}>Efficiency scorecard</h3>
          <div className="flex items-center gap-2">
            {snapshot.unverifiedCount > 0 && (
              <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400`}>{snapshot.unverifiedCount} unverified</span>
            )}
            <span className={mutedTextCls}>{snapshot.overall.achieved}/{snapshot.overall.possible} · {snapshot.overall.pct}%</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className={tableHeadCls}>
                <th className="px-4 py-2.5">KPI</th>
                <th className="px-4 py-2.5">Actual</th>
                <th className="px-4 py-2.5">Score</th>
                <th className="px-4 py-2.5">Verification</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.kpis.map((kpi) => (
                <tr key={kpi.key} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2.5">
                    <div className="text-gray-900 dark:text-white">{kpi.name}</div>
                    <div className={mutedTextCls}>{kpi.category}{kpi.provisional && ' · provisional'}</div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-900 dark:text-white font-medium">
                    {kpi.notTracked ? <span className="text-gray-400 dark:text-gray-500">Not tracked yet</span>
                      : kpi.isNa ? <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400`}>N/A</span>
                      : kpi.actual === null ? <span className="text-gray-400 dark:text-gray-500">—</span> : `${kpi.actual}${kpi.unit}`}
                  </td>
                  <td className="px-4 py-2.5">
                    {kpi.score === null || kpi.band === null
                      ? <span className="text-gray-400 dark:text-gray-500">{kpi.isNa ? 'Excluded' : '—'}</span>
                      : <span className={`${badgeCls} ${BAND_CLS[kpi.band]}`}>{kpi.score}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {!kpi.isNa && !kpi.notTracked && kpi.actual !== null && (
                      <span className={`${badgeCls} ${VERIFICATION_CLS[kpi.status]}`}>{kpi.status === 'verified' ? 'Verified' : 'Unverified'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** One renderer for every stored snapshot, picked by its `version`, so old reviews keep rendering after the shape changes. */
export default function ReviewSnapshotView({ snapshot, heading }: { snapshot: ReviewSnapshot; heading?: string }) {
  return (
    <div className="space-y-3">
      {heading && <h2 className={sectionTitleCls}>{heading}</h2>}
      {snapshot.version === 1 ? (
        <SnapshotV1 snapshot={snapshot} />
      ) : (
        <p className={mutedTextCls}>This review was saved in a newer format than this screen can show.</p>
      )}
    </div>
  )
}
