import { render, screen, within } from '@testing-library/react'
import ReviewSnapshotView, { formatAsAt } from './ReviewSnapshotView'
import { EFFICIENCY_METRIC_DEFS } from '@/lib/leadops/constants'
import { buildReviewSnapshot, type ReviewSnapshot } from '@/lib/leadops/reviewSnapshot'

const manual = EFFICIENCY_METRIC_DEFS.find((d) => d.inputMode !== 'derived')!
const snap = (over: Partial<ReviewSnapshot> = {}): ReviewSnapshot => ({
  ...buildReviewSnapshot({
    period: '2026-10-01', teamLeaderName: 'Taylor', sharedByName: 'Alex', takenAt: '2026-11-03T12:20:00.000Z',
    scores: [{ id: 's', tl_id: 't', period: '2026-10-01', metric_key: manual.key, self_value: manual.green, is_na: false, na_reason: null, verified_value: null, status: 'self_reported', verified_by: null, verified_at: null, verification_note: null, updated_at: '' }],
    weekly: { weeks: 4, calibrationAttended: 3, coachingSessions: 9, agentInSeatDays: 2, criticalFails: 1, reAudits: 6 },
  }),
  ...over,
})

describe('formatAsAt', () => {
  it('shows South African time (UTC+2)', () => {
    expect(formatAsAt('2026-11-03T12:20:00.000Z')).toBe('3 Nov, 14:20')
    expect(formatAsAt('2026-11-03T22:30:00.000Z')).toBe('4 Nov, 00:30')
  })

  it('reads a raw Postgres timestamptz string (space separator, +00 offset)', () => {
    expect(formatAsAt('2026-11-03 12:20:00+00')).toBe('3 Nov, 14:20')
  })

  it('shows a dash, never NaN, for a value it cannot read', () => {
    expect(formatAsAt('garbage')).toBe('—')
    expect(formatAsAt('')).toBe('—')
  })
})

describe('ReviewSnapshotView (version 1)', () => {
  it('shows "Figures as at" with the time the snapshot was taken', () => {
    render(<ReviewSnapshotView snapshot={snap()} />)
    expect(screen.getByText('Figures as at 3 Nov, 14:20')).toBeInTheDocument()
  })

  it('shows the weekly totals', () => {
    render(<ReviewSnapshotView snapshot={snap()} />)
    for (const [label, value] of [['Calibration attended', '3/4'], ['Coaching sessions', '9'], ['Agent-in-seat days', '2'], ['Critical fails', '1'], ['Re-audits', '6']]) {
      expect(screen.getByText(label).parentElement).toHaveTextContent(value)
    }
  })

  it('shows each KPI with its frozen value, and the planner KPIs as "Not tracked yet"', () => {
    render(<ReviewSnapshotView snapshot={snap()} />)
    const row = screen.getByText(manual.kpi).closest('tr')!
    expect(within(row).getByText(`${manual.green}${manual.unit}`)).toBeInTheDocument()
    expect(within(row).getByText('Unverified')).toBeInTheDocument()
    expect(screen.getAllByText('Not tracked yet')).toHaveLength(2)
  })

  it('shows N/A KPIs as N/A', () => {
    const s = snap()
    s.kpis = s.kpis.map((k) => (k.key === manual.key ? { ...k, isNa: true, actual: null, score: null, band: null, naReason: 'No QA' } : k))
    render(<ReviewSnapshotView snapshot={s} />)
    expect(within(screen.getByText(manual.kpi).closest('tr')!).getByText('N/A')).toBeInTheDocument()
  })

  it('renders from the STORED snapshot only: a changed definition elsewhere cannot change it (thresholds and names are in the snapshot)', () => {
    const s = snap()
    s.kpis = s.kpis.map((k) => (k.key === manual.key ? { ...k, name: 'Frozen KPI name' } : k))
    render(<ReviewSnapshotView snapshot={s} />)
    expect(screen.getByText('Frozen KPI name')).toBeInTheDocument()
  })

  it('does not crash on a snapshot version it does not know', () => {
    render(<ReviewSnapshotView snapshot={{ ...snap(), version: 99 } as unknown as ReviewSnapshot} />)
    expect(screen.getByText('This review was saved in a newer format than this screen can show.')).toBeInTheDocument()
  })
})
