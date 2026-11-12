// The real figures a review snapshot is built from. Server-only (imports the database pool) and NOT a
// 'use server' module: it is not an endpoint, and it does no authorisation — every caller has authorised already.

import { sql } from '@/lib/db/pool'
import { nextMonthStart } from './reviewLimits'
import type { WeeklyFigures } from './reviewSnapshot'
import type { EfficiencyScore } from './types'

interface ScoreRow {
  id: string
  tl_id: string | null
  period: string
  metric_key: string
  self_value: string | null
  is_na: boolean
  na_reason: string | null
  verified_value: string | null
  status: string
  verified_by: string | null
  verified_at: string | null
  verification_note: string | null
  updated_at: string
}

const toScore = (r: ScoreRow): EfficiencyScore => ({
  id: r.id,
  tl_id: r.tl_id,
  period: r.period,
  metric_key: r.metric_key,
  self_value: r.self_value === null ? null : Number(r.self_value),
  is_na: r.is_na,
  na_reason: r.na_reason,
  verified_value: r.verified_value === null ? null : Number(r.verified_value),
  status: r.status as EfficiencyScore['status'],
  verified_by: r.verified_by,
  verified_at: r.verified_at,
  verification_note: r.verification_note,
  updated_at: r.updated_at,
})

/**
 * The KPI actuals for the month, and the weekly activity totals: daily rows summed by their date within the month,
 * and the weekly manual rows whose Monday falls in the month (spec: weekly activity and the KPI scorecard).
 */
export async function loadReviewFigures(tlId: string, period: string): Promise<{ scores: EfficiencyScore[]; weekly: WeeklyFigures }> {
  const next = nextMonthStart(period)
  const [scoreRows, dailyRows, weeklyRows] = await Promise.all([
    sql<ScoreRow[]>`SELECT * FROM efficiency_scores WHERE tl_id = ${tlId} AND period = ${period}`,
    sql<{ coaching_sessions: number; agent_in_seat: boolean; critical_fails: number }[]>`
      SELECT coaching_sessions, agent_in_seat, critical_fails FROM daily_activity_logs
      WHERE tl_id = ${tlId} AND date >= ${period} AND date < ${next}
    `,
    sql<{ calibration: boolean; re_audits: number }[]>`
      SELECT calibration, re_audits FROM weekly_manual_logs
      WHERE tl_id = ${tlId} AND week_of >= ${period} AND week_of < ${next}
    `,
  ])
  return {
    scores: scoreRows.map(toScore),
    weekly: {
      weeks: weeklyRows.length,
      calibrationAttended: weeklyRows.filter((w) => w.calibration).length,
      coachingSessions: dailyRows.reduce((sum, d) => sum + Number(d.coaching_sessions), 0),
      agentInSeatDays: dailyRows.filter((d) => d.agent_in_seat).length,
      criticalFails: dailyRows.reduce((sum, d) => sum + Number(d.critical_fails), 0),
      reAudits: weeklyRows.reduce((sum, w) => sum + Number(w.re_audits), 0),
    },
  }
}
