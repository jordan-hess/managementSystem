'use server'

import type { TransactionSql } from 'postgres'
import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { isAdminOrManagement, isTeamLeaderOrAbove } from '@/lib/auth/authz'
import { canAccessRequest, type ExistingRequest } from '@/lib/roster/canAccessRequest'
import type { AttendanceRecord, AttendanceStatus, LeaveType, OverrideType, Request, RequestStatus, RosterOverride, Role, ShiftType } from '@/types'

/**
 * Server actions backing components/roster/admin/TeamRequestsBody.tsx and
 * components/requests/admin/RequestReviewDrawer.tsx — ported off direct
 * `supabase.from('requests'|'request_approval_history')` calls made from
 * the browser, which had ZERO app-code authorization of their own (relied
 * entirely on RLS, which no longer exists).
 *
 * - requests SELECT/UPDATE: split cleanly by who submitted the request
 *   (canAccessRequest checks the request's own requester_role, separately
 *   from the caller's role — matches app/(app)/roster/page.tsx's
 *   pendingRequests/myRequests fetches, which apply the same split at the
 *   list level):
 *     - Agent-authored: profile_id = caller, OR caller's role is
 *       team_leader/admin. Management/HOD do NOT see or act on these —
 *       team leaders own agent requests end to end. Team scoping (default
 *       "My Team", optional "All Teams") is a client-side view filter only
 *       (see TeamRequestsBody) — it is not an authorization boundary.
 *     - team_leader/admin-authored: caller's role is management/hod ONLY —
 *       not the submitter, and not any other team leader/admin. Actively
 *       notified via notify_management_on_team_leader_request.
 *   This action re-derives the caller's role fresh from the DB (never
 *   trusts a client-supplied value) before allowing the update.
 *
 * - requests DELETE (not exercised by either component — documented here
 *   for completeness / for whoever adds a delete flow later): profile_id =
 *   caller OR caller's role = 'admin'. This is DELIBERATELY NARROWER than
 *   SELECT/UPDATE above — do not widen it to match those without a deliberate
 *   decision to do so.
 *
 * - request_approval_history INSERT: changed_by = caller AND caller's role
 *   is team_leader/management/hod/admin. Previously a plain team_leader
 *   could approve/reject via the SELECT/UPDATE branch without ever being
 *   allowed to log an approval_history row for it (a pre-existing gap
 *   inherited from the old RLS policies) — that gap is now closed.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

interface AuthedUser {
  userId: string
  role: Role
}

async function requireUser(): Promise<AuthedUser | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Unauthorized' }
  const rows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  const role = rows[0]?.role
  if (!role) return { error: 'Unauthorized' }
  return { userId, role }
}

async function loadExistingRequest(id: string): Promise<ExistingRequest | null> {
  const rows = await sql<ExistingRequest[]>`
    SELECT r.profile_id, r.team_id, r.status, r.type, p.role AS requester_role
    FROM requests r JOIN profiles p ON p.id = r.profile_id
    WHERE r.id = ${id}
  `
  return rows[0] ?? null
}

/**
 * Marks the requester as on leave in the roster for every date on an
 * approved leave request, by upserting attendance_records rows — the same
 * table/upsert shape markAttendanceAction uses for a manual single-day mark.
 * attendance_records already takes precedence over both the recurring
 * rotation and roster_overrides in resolveShift (lib/roster/resolveShift.ts),
 * and 'leave'/'sick' are already-supported display states in the roster UI
 * (lib/roster/teamColors.ts, lib/roster/attendanceColors.ts) — this just
 * populates that existing mechanism automatically instead of requiring a
 * manual Mark Attendance entry per date. Sick leave maps to the 'sick'
 * attendance status (matching how the roster UI/legend already treats it);
 * every other leave type maps to 'leave'. has_doctor_note is always false
 * here — the leave request form doesn't collect that, it's a
 * Mark-Attendance-only field. Called from inside reviewRequestAction's own
 * transaction, so a failure here rolls back the approval too rather than
 * leaving a request "approved" with no roster reflection.
 */
async function markLeaveOnRoster(tx: TransactionSql, profileId: string, requestId: string, approverId: string): Promise<void> {
  const leaveRows = await tx<{ leave_type: LeaveType; dates: string[] }[]>`
    SELECT leave_type, dates FROM leave_requests WHERE request_id = ${requestId}
  `
  const leave = leaveRows[0]
  if (!leave || leave.dates.length === 0) return

  const attendanceStatus: AttendanceStatus = leave.leave_type === 'sick' ? 'sick' : 'leave'

  await tx`
    INSERT INTO attendance_records (profile_id, date, status, notes, has_doctor_note, marked_by, marked_at)
    SELECT ${profileId}, d, ${attendanceStatus}, ${'Auto-marked: approved leave request'}, false, ${approverId}, NOW()
    FROM unnest(${leave.dates}::date[]) AS d
    ON CONFLICT (profile_id, date) DO UPDATE SET
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      has_doctor_note = EXCLUDED.has_doctor_note,
      marked_by = EXCLUDED.marked_by,
      marked_at = EXCLUDED.marked_at,
      updated_at = NOW()
  `
}

/** See header comment — team_leader is now included, closing the old audit-log gap. */
function canInsertApprovalHistory(role: Role): boolean {
  return isTeamLeaderOrAbove(role)
}

/**
 * Approve / reject / request-changes on a leave or overtime request.
 * Used by TeamRequestsBody's quick-approve/reject buttons and
 * RequestReviewDrawer's three review buttons.
 */
export async function reviewRequestAction(
  requestId: string,
  status: Extract<RequestStatus, 'approved' | 'rejected' | 'changes_requested'>,
  comment?: string,
): Promise<ActionResult<Request>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  if ((status === 'rejected' || status === 'changes_requested') && !comment?.trim()) {
    return { error: 'A comment is required when rejecting or requesting changes.' }
  }

  const existing = await loadExistingRequest(requestId)
  if (!existing) return { error: 'Request not found.' }

  if (!canAccessRequest(userId, role, existing)) {
    return { error: 'You do not have permission to review this request.' }
  }

  const shouldLogHistory = canInsertApprovalHistory(role)
  const trimmedComment = comment?.trim() || null

  try {
    const updated = await withTransaction(async (tx) => {
      const rows = await tx<Request[]>`
        UPDATE requests SET
          status = ${status},
          admin_comment = ${trimmedComment},
          reviewed_by = ${userId},
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${requestId}
        RETURNING *
      `
      if (shouldLogHistory) {
        await tx`
          INSERT INTO request_approval_history (request_id, changed_by, from_status, to_status, comment)
          VALUES (${requestId}, ${userId}, ${existing.status}, ${status}, ${trimmedComment})
        `
      }
      if (status === 'approved' && existing.type === 'leave') {
        await markLeaveOnRoster(tx, existing.profile_id, requestId, userId)
      }
      return rows[0]
    })
    return { data: updated }
  } catch (error) {
    console.error('reviewRequestAction failed', error)
    return { error: 'Could not update the request.' }
  }
}

// ─── Request submission (components/requests/LeaveRequestForm.tsx,
// components/requests/OvertimeRequestForm.tsx) ──────────────────────────────
//
// requests/leave_requests/overtime_requests/overtime_entries INSERT: self-
// submit only (requests_insert/leave_requests_insert/overtime_requests_insert
// WITH CHECK profile_id = auth.uid() / joins back to a requests row owned by
// auth.uid() — requests-schema.sql). profile_id is always taken from
// getCurrentUserId(), never from client input. team_id is likewise re-derived
// server-side from the caller's own team_members row rather than trusting
// whatever the client passed, since it drives the notify_team_leader_on_request
// trigger's recipient. Both actions wrap their requests + child-table inserts
// in one withTransaction so a request row is never left without its detail
// row. The notify_team_leader_on_request DB trigger fires automatically on
// the `requests` INSERT — no notification logic is duplicated here.
//
// Management deliberately gets no equivalent active notification for a
// team_leader/admin-authored request (the old notify_management_on_team_
// leader_request trigger was dropped) — they already see it passively in
// their Pending Requests queue, restricted to Management/HOD only (see
// canAccessRequest below), and can approve/deny from there.

async function currentUserTeamId(tx: TransactionSql, userId: string): Promise<string | null> {
  const rows = await tx<{ team_id: string }[]>`SELECT team_id FROM team_members WHERE profile_id = ${userId}`
  return rows[0]?.team_id ?? null
}

export interface SubmitLeaveRequestInput {
  leaveType: LeaveType
  dates: string[]
  notes: string | null
}

/** Used by components/requests/LeaveRequestForm.tsx. */
export async function submitLeaveRequest(
  input: SubmitLeaveRequestInput
): Promise<ActionResult<Request>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId } = auth

  if (input.dates.length === 0) return { error: 'Please select at least one date.' }

  try {
    const created = await withTransaction(async (tx) => {
      const teamId = await currentUserTeamId(tx, userId)

      const reqRows = await tx<Request[]>`
        INSERT INTO requests (profile_id, team_id, type, status)
        VALUES (${userId}, ${teamId}, 'leave', 'pending')
        RETURNING *
      `
      const request = reqRows[0]

      await tx`
        INSERT INTO leave_requests (request_id, leave_type, dates, notes)
        VALUES (${request.id}, ${input.leaveType}, ${input.dates}::date[], ${input.notes})
      `

      return request
    })
    return { data: created }
  } catch (error) {
    console.error('submitLeaveRequest failed', error)
    return { error: 'Failed to submit leave request.' }
  }
}

export interface SubmitOvertimeEntryInput {
  date: string
  shift: ShiftType
  ot_1_5: number
  ot_2_0: number
  night_hours: number
}

export interface SubmitOvertimeRequestInput {
  month: number
  year: number
  notes: string | null
  entries: SubmitOvertimeEntryInput[]
}

/** Used by components/requests/OvertimeRequestForm.tsx. */
export async function submitOvertimeRequest(
  input: SubmitOvertimeRequestInput
): Promise<ActionResult<Request>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId } = auth

  const filledEntries = input.entries.filter(e => e.date)
  if (filledEntries.length === 0) return { error: 'Please add at least one date entry.' }

  try {
    const created = await withTransaction(async (tx) => {
      const teamId = await currentUserTeamId(tx, userId)

      const reqRows = await tx<Request[]>`
        INSERT INTO requests (profile_id, team_id, type, status)
        VALUES (${userId}, ${teamId}, 'overtime', 'pending')
        RETURNING *
      `
      const request = reqRows[0]

      const otRows = await tx<{ id: string }[]>`
        INSERT INTO overtime_requests (request_id, month, year, notes)
        VALUES (${request.id}, ${input.month}, ${input.year}, ${input.notes})
        RETURNING id
      `
      const overtimeRequestId = otRows[0].id

      for (const [index, entry] of filledEntries.entries()) {
        await tx`
          INSERT INTO overtime_entries (overtime_request_id, date, shift, ot_1_5, ot_2_0, night_hours, sort_order)
          VALUES (${overtimeRequestId}, ${entry.date}, ${entry.shift}, ${entry.ot_1_5 || 0}, ${entry.ot_2_0 || 0}, ${entry.night_hours || 0}, ${index})
        `
      }

      return request
    })
    return { data: created }
  } catch (error) {
    console.error('submitOvertimeRequest failed', error)
    return { error: 'Failed to submit overtime request.' }
  }
}

// ─── Shift rotations (components/roster/admin/ShiftRotationModal.tsx) ──────
//
// shift_templates/team_rotations INSERT/UPDATE/DELETE: allowed only for
// current user's role IN ('admin', 'management') — see roster-schema.sql's
// final (post-migration) policy for these tables, as verified in the
// migration plan for this batch.

async function requireAdminOrManagement(): Promise<{ userId: string } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }
  const rows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  const role = rows[0]?.role
  if (!role || !isAdminOrManagement(role)) {
    return { error: 'You do not have permission to manage shift rotations.' }
  }
  return { userId }
}

/**
 * Attendance-specific write gate — management/hod, plus anyone assigned as
 * a team's leader via the team_leaders table (per explicit product
 * decision: a bare admin with no team_leaders row still can't mark
 * attendance, same as before, but a team_leaders-linked admin now can,
 * unscoped — for any agent, not just their own team's, matching
 * management/hod's existing unrestricted access rather than inventing a
 * narrower per-team carve-out). team_leaders enforces its own profile_id
 * must be an admin (enforce_team_leader_is_admin trigger) — there is a
 * separate profiles.role = 'team_leader' value in the type system, but
 * zero profiles use it in practice; every real team leader today is an
 * admin with a team_leaders row, which is what this checks.
 * Scoped to markAttendanceAction only — every other roster-write action
 * (shift templates, rotations, overrides) stays admin/management-only via
 * requireAdminOrManagement above.
 */
async function requireAttendanceWriteAccess(): Promise<{ userId: string } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }
  const rows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  const role = rows[0]?.role
  if (!role) return { error: 'Not authenticated.' }
  if (role === 'management' || role === 'hod') return { userId }
  const leaderRows = await sql<{ id: string }[]>`SELECT id FROM team_leaders WHERE profile_id = ${userId} LIMIT 1`
  if (leaderRows.length > 0) return { userId }
  return { error: 'You do not have permission to manage attendance for this agent.' }
}

// ─── Attendance & roster overrides (components/roster/admin/MarkAttendanceModal.tsx,
// components/roster/admin/RosterOverrideModal.tsx, components/roster/admin/AssignShiftModal.tsx) ──
//
// roster_overrides INSERT/UPDATE/DELETE (upsertRosterOverrideAction/
// AssignShiftModal's actions below): admin/management/hod, via
// requireAdminOrManagement — admin can still swap/override a schedule.
// attendance_records INSERT/UPDATE (markAttendanceAction): management/hod
// ONLY, via requireAttendanceWriteAccess just above — admin can view the
// roster grid the same as management, but cannot mark attendance (an
// explicit product decision narrower than the roster_overrides gate; see
// that function's own doc comment for the reasoning). Both read (SELECT)
// sides stay self-or-admin/management (management-attendance-read-access.sql)
// — this file only enforces the write side, since none of these three
// components read these tables directly themselves.

/**
 * Upserts one attendance_records row (profile_id, date) — used by
 * MarkAttendanceModal. `marked_by`/`marked_at` are always re-derived from the
 * authenticated caller/server clock, never trusted from the client.
 */
export async function markAttendanceAction(
  profileId: string,
  date: string,
  status: AttendanceStatus,
  notes: string | null,
  hasDoctorNote: boolean,
): Promise<{ data: AttendanceRecord } | { error: string }> {
  const auth = await requireAttendanceWriteAccess()
  if ('error' in auth) return auth

  try {
    const rows = await sql<AttendanceRecord[]>`
      INSERT INTO attendance_records (profile_id, date, status, notes, has_doctor_note, marked_by, marked_at)
      VALUES (${profileId}, ${date}, ${status}, ${notes}, ${status === 'sick' ? hasDoctorNote : false}, ${auth.userId}, NOW())
      ON CONFLICT (profile_id, date) DO UPDATE SET
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        has_doctor_note = EXCLUDED.has_doctor_note,
        marked_by = EXCLUDED.marked_by,
        marked_at = EXCLUDED.marked_at,
        updated_at = NOW()
      RETURNING *
    `
    return { data: rows[0] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save attendance.' }
  }
}

/**
 * Upserts one roster_overrides row (profile_id, date) — used by
 * RosterOverrideModal. `created_by` is always re-derived from the
 * authenticated caller, never trusted from the client.
 */
export async function upsertRosterOverrideAction(
  profileId: string,
  date: string,
  overrideType: OverrideType,
  shiftTemplateId: string | null,
  notes: string | null,
): Promise<{ data: RosterOverride } | { error: string }> {
  const auth = await requireAdminOrManagement()
  if ('error' in auth) return auth

  try {
    const rows = await sql<RosterOverride[]>`
      INSERT INTO roster_overrides (profile_id, date, override_type, shift_template_id, notes, created_by)
      VALUES (${profileId}, ${date}, ${overrideType}, ${shiftTemplateId}, ${notes}, ${auth.userId})
      ON CONFLICT (profile_id, date) DO UPDATE SET
        override_type = EXCLUDED.override_type,
        shift_template_id = EXCLUDED.shift_template_id,
        notes = EXCLUDED.notes,
        created_by = EXCLUDED.created_by
      RETURNING *
    `
    return { data: rows[0] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save override.' }
  }
}

/**
 * Assigns one shift template to one individual agent as a `swap_in`
 * roster_overrides row for each date passed in — used by AssignShiftModal.
 * Distinct from assignShiftToTeamForWeeks above: that one creates
 * team_rotations rows scoping a whole team to a shift for entire weeks;
 * this one creates per-agent, per-day roster_overrides rows (the same table
 * RosterOverrideModal writes to), matching AssignShiftModal's original
 * direct-Supabase upsert onto `roster_overrides`. `created_by` is always
 * re-derived from the authenticated caller, never trusted from the client.
 */
export async function assignShiftOverridesAction(
  profileId: string,
  shiftTemplateId: string,
  dates: string[],
): Promise<{ success: true } | { error: string }> {
  const auth = await requireAdminOrManagement()
  if ('error' in auth) return auth
  if (dates.length === 0) return { success: true }

  try {
    await sql`
      INSERT INTO roster_overrides (profile_id, date, override_type, shift_template_id, notes, created_by)
      SELECT ${profileId}, d, 'swap_in', ${shiftTemplateId}, NULL, ${auth.userId}
      FROM unnest(${dates}::date[]) AS d
      ON CONFLICT (profile_id, date) DO UPDATE SET
        override_type = EXCLUDED.override_type,
        shift_template_id = EXCLUDED.shift_template_id,
        notes = EXCLUDED.notes,
        created_by = EXCLUDED.created_by
    `
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to assign shift.' }
  }
}
