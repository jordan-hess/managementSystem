import { sql } from '@/lib/db/pool'
import { requireActiveUser } from '@/lib/auth/requireUser'
import { canViewFullRoster } from '@/lib/auth/authz'
import { getMonthRange, getRotationWeekRange } from '@/lib/roster/calendarUtils'
import { NextRequest, NextResponse } from 'next/server'
import { TeamRotation, AttendanceRecord, RosterOverride } from '@/types'

export async function GET(request: NextRequest) {
  // requireActiveUser() re-checks is_active and force_password_change -
  // this route previously only checked getCurrentUserId() (session
  // presence), so a deactivated account's still-live JWT could keep
  // reading roster data for up to the session's 12h lifetime (2026-09-18
  // prod-readiness follow-up; proxy.ts's own gates don't cover app/api/*
  // routes).
  const auth = await requireActiveUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 })
  const { userId, role } = auth

  const { searchParams } = new URL(request.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
    return NextResponse.json({ error: 'Invalid year/month.' }, { status: 400 })
  }

  const { from, to } = getMonthRange(year, month)
  const { from: weekFrom, to: weekTo } = getRotationWeekRange(year, month)

  // attendance_records/roster_overrides SELECT: self OR admin/management/
  // qa_analyst — must match canViewAllAttendance in app/(app)/roster/page.tsx.
  const canViewAll = canViewFullRoster(role)

  try {
    const [rotations, attendanceRecords, overrides] = await Promise.all([
      sql<TeamRotation[]>`
        SELECT tr.*,
          jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) AS teams,
          jsonb_build_object(
            'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time,
            'work_days', st.work_days, 'is_late_shift', st.is_late_shift
          ) AS shift_templates
        FROM team_rotations tr
        JOIN teams t ON t.id = tr.team_id
        JOIN shift_templates st ON st.id = tr.shift_template_id
        WHERE tr.week_start_date >= ${weekFrom} AND tr.week_start_date <= ${weekTo}
      `,
      canViewAll
        ? sql<AttendanceRecord[]>`SELECT * FROM attendance_records WHERE date >= ${from} AND date <= ${to}`
        : sql<AttendanceRecord[]>`SELECT * FROM attendance_records WHERE date >= ${from} AND date <= ${to} AND profile_id = ${userId}`,
      canViewAll
        ? sql<RosterOverride[]>`
            SELECT ro.*,
              CASE WHEN st.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time
              ) END AS shift_templates
            FROM roster_overrides ro
            LEFT JOIN shift_templates st ON st.id = ro.shift_template_id
            WHERE ro.date >= ${from} AND ro.date <= ${to}
          `
        : sql<RosterOverride[]>`
            SELECT ro.*,
              CASE WHEN st.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', st.id, 'name', st.name, 'start_time', st.start_time, 'end_time', st.end_time
              ) END AS shift_templates
            FROM roster_overrides ro
            LEFT JOIN shift_templates st ON st.id = ro.shift_template_id
            WHERE ro.date >= ${from} AND ro.date <= ${to} AND ro.profile_id = ${userId}
          `,
    ])

    return NextResponse.json({
      rotations: rotations ?? [],
      attendanceRecords: attendanceRecords ?? [],
      overrides: overrides ?? [],
    })
  } catch {
    return NextResponse.json({ error: 'Failed to load roster data.' }, { status: 500 })
  }
}
