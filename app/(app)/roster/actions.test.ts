jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/db/tx', () => ({ withTransaction: jest.fn() }))
jest.mock('@/lib/auth/getCurrentUserId', () => ({ getCurrentUserId: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import {
  reviewRequestAction,
  submitLeaveRequest,
  submitOvertimeRequest,
  markAttendanceAction,
  upsertRosterOverrideAction,
  assignShiftOverridesAction,
} from './actions'

const mockSql = sql as unknown as jest.Mock
const mockWithTransaction = withTransaction as jest.Mock
const mockGetCurrentUserId = getCurrentUserId as jest.Mock

beforeEach(() => {
  mockSql.mockReset()
  mockWithTransaction.mockReset()
  mockGetCurrentUserId.mockReset()
  mockWithTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockSql))
})

function mockRole(role: string, userId = 'user-1') {
  mockGetCurrentUserId.mockResolvedValue(userId)
  mockSql.mockResolvedValueOnce([{ role }])
}

const agentAuthoredRequest = {
  profile_id: 'agent-1', team_id: 'team-1', status: 'pending' as const, type: 'leave' as const, requester_role: 'agent' as const,
}

describe('reviewRequestAction', () => {
  it('requires a comment when rejecting', async () => {
    mockRole('team_leader')

    const result = await reviewRequestAction('req-1', 'rejected')

    expect(result).toEqual({ error: 'A comment is required when rejecting or requesting changes.' })
    expect(mockSql).toHaveBeenCalledTimes(1) // only the role lookup - never reaches the request lookup
  })

  it('errors when the request does not exist', async () => {
    mockRole('team_leader')
    mockSql.mockResolvedValueOnce([]) // loadExistingRequest

    const result = await reviewRequestAction('req-1', 'approved')

    expect(result).toEqual({ error: 'Request not found.' })
  })

  it('denies management from reviewing an agent-authored request - that stays team-leader-level', async () => {
    mockRole('management')
    mockSql.mockResolvedValueOnce([agentAuthoredRequest])

    const result = await reviewRequestAction('req-1', 'approved')

    expect(result).toEqual({ error: 'You do not have permission to review this request.' })
  })

  it('lets the requester themselves act on their own agent-authored request, but does not log approval history for an agent role', async () => {
    mockRole('agent', 'agent-1') // canAccessRequest: profile_id === userId
    mockSql
      .mockResolvedValueOnce([{ ...agentAuthoredRequest, type: 'overtime' }]) // loadExistingRequest
      .mockResolvedValueOnce([{ id: 'req-1', status: 'approved' }]) // UPDATE requests

    const result = await reviewRequestAction('req-1', 'approved')

    expect(result).toEqual({ data: { id: 'req-1', status: 'approved' } })
    expect(mockSql).toHaveBeenCalledTimes(3) // role, load, UPDATE - no approval_history insert, no leave lookup (type=overtime)
  })

  it('team_leader approving logs approval history', async () => {
    mockRole('team_leader')
    mockSql
      .mockResolvedValueOnce([{ ...agentAuthoredRequest, type: 'overtime' }])
      .mockResolvedValueOnce([{ id: 'req-1', status: 'approved' }]) // UPDATE
      .mockResolvedValueOnce([]) // approval_history insert

    await reviewRequestAction('req-1', 'approved', 'looks good')

    expect(mockSql).toHaveBeenCalledTimes(4)
  })

  it('approving a leave-type request marks the roster via markLeaveOnRoster, skipped when no leave_requests row exists', async () => {
    mockRole('team_leader')
    mockSql
      .mockResolvedValueOnce([agentAuthoredRequest]) // loadExistingRequest (type: leave)
      .mockResolvedValueOnce([{ id: 'req-1', status: 'approved' }]) // UPDATE
      .mockResolvedValueOnce([]) // approval_history insert
      .mockResolvedValueOnce([]) // markLeaveOnRoster's leave_requests lookup - none found, short-circuits

    const result = await reviewRequestAction('req-1', 'approved')

    expect(result).toEqual({ data: { id: 'req-1', status: 'approved' } })
    expect(mockSql).toHaveBeenCalledTimes(5) // + the leave_requests lookup, no attendance_records insert since leave was empty
  })

  it('approving a leave request with dates upserts attendance_records for each date, sick mapped to status sick', async () => {
    mockRole('team_leader')
    mockSql
      .mockResolvedValueOnce([agentAuthoredRequest])
      .mockResolvedValueOnce([{ id: 'req-1', status: 'approved' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ leave_type: 'sick', dates: ['2026-09-20', '2026-09-21'] }]) // leave_requests lookup
      .mockResolvedValueOnce([]) // attendance_records upsert

    await reviewRequestAction('req-1', 'approved')

    expect(mockSql).toHaveBeenCalledTimes(6)
    const attendanceInsertArgs = mockSql.mock.calls[5]
    expect(attendanceInsertArgs).toEqual(expect.arrayContaining(['sick']))
  })
})

describe('submitLeaveRequest', () => {
  it('requires at least one date', async () => {
    mockRole('agent')

    const result = await submitLeaveRequest({ leaveType: 'annual', dates: [], notes: null })

    expect(result).toEqual({ error: 'Please select at least one date.' })
  })

  it('creates the request under the caller and links a leave_requests row', async () => {
    mockRole('agent')
    mockSql
      .mockResolvedValueOnce([{ team_id: 'team-1' }]) // currentUserTeamId
      .mockResolvedValueOnce([{ id: 'req-1' }]) // INSERT requests
      .mockResolvedValueOnce([]) // INSERT leave_requests

    const result = await submitLeaveRequest({ leaveType: 'annual', dates: ['2026-09-20'], notes: 'family event' })

    expect(result).toEqual({ data: { id: 'req-1' } })
    const requestInsertArgs = mockSql.mock.calls[2]
    expect(requestInsertArgs[1]).toBe('user-1') // profile_id is always the caller
  })
})

describe('submitOvertimeRequest', () => {
  it('requires at least one filled entry', async () => {
    mockRole('agent')

    const result = await submitOvertimeRequest({ month: 9, year: 2026, notes: null, entries: [{ date: '', shift: 'day', ot_1_5: 0, ot_2_0: 0, night_hours: 0 }] })

    expect(result).toEqual({ error: 'Please add at least one date entry.' })
  })

  it('creates the request, the overtime_requests row, and one overtime_entries row per filled entry', async () => {
    mockRole('agent')
    mockSql
      .mockResolvedValueOnce([{ team_id: 'team-1' }]) // currentUserTeamId
      .mockResolvedValueOnce([{ id: 'req-1' }]) // INSERT requests
      .mockResolvedValueOnce([{ id: 'ot-1' }]) // INSERT overtime_requests
      .mockResolvedValueOnce([]) // INSERT overtime_entries #1
      .mockResolvedValueOnce([]) // INSERT overtime_entries #2

    const result = await submitOvertimeRequest({
      month: 9, year: 2026, notes: null,
      entries: [
        { date: '2026-09-01', shift: 'day', ot_1_5: 2, ot_2_0: 0, night_hours: 0 },
        { date: '2026-09-02', shift: 'night', ot_1_5: 0, ot_2_0: 1, night_hours: 3 },
      ],
    })

    expect(result).toEqual({ data: { id: 'req-1' } })
    expect(mockSql).toHaveBeenCalledTimes(6) // role + teamId + requests + overtime_requests + 2 entries
  })
})

describe('markAttendanceAction — requireAttendanceWriteAccess', () => {
  it('denies a plain agent with no team_leaders row', async () => {
    mockRole('agent')
    mockSql.mockResolvedValueOnce([]) // team_leaders lookup - agent isn't management/hod, so this still runs

    const result = await markAttendanceAction('agent-2', '2026-09-20', 'leave', null, false)

    expect(result).toEqual({ error: 'You do not have permission to manage attendance for this agent.' })
  })

  it('denies an admin with no team_leaders row', async () => {
    mockRole('admin')
    mockSql.mockResolvedValueOnce([]) // team_leaders lookup - none

    const result = await markAttendanceAction('agent-2', '2026-09-20', 'leave', null, false)

    expect(result).toEqual({ error: 'You do not have permission to manage attendance for this agent.' })
  })

  it('allows an admin who has a team_leaders row', async () => {
    mockRole('admin')
    mockSql
      .mockResolvedValueOnce([{ id: 'tl-row-1' }]) // team_leaders lookup - found
      .mockResolvedValueOnce([{ id: 'att-1', status: 'leave' }]) // upsert

    const result = await markAttendanceAction('agent-2', '2026-09-20', 'leave', null, false)

    expect(result).toEqual({ data: { id: 'att-1', status: 'leave' } })
  })

  it('allows management without needing a team_leaders row', async () => {
    mockRole('management')
    mockSql.mockResolvedValueOnce([{ id: 'att-1' }]) // upsert directly - no team_leaders lookup for management

    const result = await markAttendanceAction('agent-2', '2026-09-20', 'leave', null, false)

    expect(result).toEqual({ data: { id: 'att-1' } })
    expect(mockSql).toHaveBeenCalledTimes(2) // role + upsert only
  })

  it('only persists has_doctor_note when status is sick, even if the caller passed true for a non-sick status', async () => {
    mockRole('management')
    mockSql.mockResolvedValueOnce([{ id: 'att-1' }])

    await markAttendanceAction('agent-2', '2026-09-20', 'leave', null, true)

    const insertArgs = mockSql.mock.calls[1]
    expect(insertArgs[5]).toBe(false) // has_doctor_note forced false for a non-sick status
  })
})

describe('upsertRosterOverrideAction / assignShiftOverridesAction — requireAdminOrManagement', () => {
  it('upsertRosterOverrideAction denies a team_leader (not admin/management)', async () => {
    mockRole('team_leader')

    const result = await upsertRosterOverrideAction('agent-2', '2026-09-20', 'swap_in', 'shift-1', null)

    expect(result).toEqual({ error: 'You do not have permission to manage shift rotations.' })
  })

  it('upsertRosterOverrideAction succeeds for admin', async () => {
    mockRole('admin')
    mockSql.mockResolvedValueOnce([{ id: 'ov-1' }])

    const result = await upsertRosterOverrideAction('agent-2', '2026-09-20', 'swap_in', 'shift-1', null)

    expect(result).toEqual({ data: { id: 'ov-1' } })
  })

  it('assignShiftOverridesAction denies a plain agent', async () => {
    mockRole('agent')

    const result = await assignShiftOverridesAction('agent-2', 'shift-1', ['2026-09-20'])

    expect(result).toEqual({ error: 'You do not have permission to manage shift rotations.' })
  })

  it('assignShiftOverridesAction short-circuits success with zero dates, without an extra query', async () => {
    mockRole('management')

    const result = await assignShiftOverridesAction('agent-2', 'shift-1', [])

    expect(result).toEqual({ success: true })
    expect(mockSql).toHaveBeenCalledTimes(1) // role lookup only
  })

  it('assignShiftOverridesAction succeeds for management with dates', async () => {
    mockRole('management')
    mockSql.mockResolvedValueOnce(undefined)

    const result = await assignShiftOverridesAction('agent-2', 'shift-1', ['2026-09-20', '2026-09-21'])

    expect(result).toEqual({ success: true })
  })
})
