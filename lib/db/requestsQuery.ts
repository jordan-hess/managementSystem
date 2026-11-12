import type { Fragment } from 'postgres'
import { sql } from './pool'
import type { RequestWithDetail } from '@/types'

/**
 * Shared SELECT for `requests` joined with its submitter/team and
 * type-specific detail (leave_requests, or overtime_requests + their
 * overtime_entries), shaped via jsonb_build_object/jsonb_agg to match
 * `RequestWithDetail` exactly as Supabase's nested embeds
 * (`profiles!requests_profile_id_fkey(...)`, `teams(...)`, `leave_requests(*)`,
 * `overtime_requests(*, overtime_entries(*))`) used to.
 *
 * Callers pass their own authorization-scoped `where` fragment (built with
 * the same `sql` tag — see postgres.js "query fragments") so the actual
 * scoping rule lives at each call site, not here. This is a pure data-shape
 * helper, not an authorization boundary.
 */
export async function queryRequestsWithDetail(where: Fragment): Promise<RequestWithDetail[]> {
  return sql<RequestWithDetail[]>`
    SELECT r.*,
      jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email) AS profiles,
      CASE WHEN t.id IS NULL THEN NULL ELSE
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)
      END AS teams,
      COALESCE(leave_detail.leave_requests, '[]'::jsonb) AS leave_requests,
      COALESCE(ot_detail.overtime_requests, '[]'::jsonb) AS overtime_requests
    FROM requests r
    JOIN profiles p ON p.id = r.profile_id
    LEFT JOIN teams t ON t.id = r.team_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', lr.id, 'request_id', lr.request_id, 'leave_type', lr.leave_type,
        'dates', lr.dates, 'notes', lr.notes
      )) AS leave_requests
      FROM leave_requests lr
      WHERE lr.request_id = r.id
    ) leave_detail ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', otr.id, 'request_id', otr.request_id, 'month', otr.month, 'year', otr.year, 'notes', otr.notes,
        'overtime_entries', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', oe.id, 'overtime_request_id', oe.overtime_request_id, 'date', oe.date, 'shift', oe.shift,
            'ot_1_5', oe.ot_1_5, 'ot_2_0', oe.ot_2_0, 'night_hours', oe.night_hours, 'sort_order', oe.sort_order
          ) ORDER BY oe.sort_order)
          FROM overtime_entries oe
          WHERE oe.overtime_request_id = otr.id
        ), '[]'::jsonb)
      )) AS overtime_requests
      FROM overtime_requests otr
      WHERE otr.request_id = r.id
    ) ot_detail ON true
    WHERE ${where}
    ORDER BY r.created_at DESC
  `
}
