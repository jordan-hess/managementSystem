/**
 * @jest-environment node
 */
// Route handlers use next/server's Request/Response, which aren't
// available under the project's default jsdom test environment.

jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/getCurrentUserId', () => ({ getCurrentUserId: jest.fn() }))
jest.mock('@/lib/auth/password', () => ({ hashPassword: jest.fn(), verifyPassword: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { hashPassword } from '@/lib/auth/password'
import { POST } from './route'

const mockSql = sql as unknown as jest.Mock
const mockGetCurrentUserId = getCurrentUserId as jest.Mock
const mockHashPassword = hashPassword as jest.Mock

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/admin/review-password-reset', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/review-password-reset', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockGetCurrentUserId.mockReset()
    mockHashPassword.mockReset()
    mockGetCurrentUserId.mockResolvedValue('reviewer-1')
  })

  it('returns 403 when a team_leader tries to approve a reset request targeting an admin', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'team_leader', is_active: true }]) // reviewer lookup
      .mockImplementationOnce(async () => [{ id: 'req-1', profile_id: 'admin-1', status: 'pending' }]) // reset request lookup
      .mockImplementationOnce(async () => [{ role: 'admin' }]) // target profile lookup

    const res = await POST(makeRequest({ request_id: 'req-1', action: 'approve' }))

    expect(res.status).toBe(403)
    expect(mockHashPassword).not.toHaveBeenCalled()
  })

  it('still allows a team_leader to approve a reset request targeting an agent', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'team_leader', is_active: true }]) // reviewer lookup
      .mockImplementationOnce(async () => [{ id: 'req-1', profile_id: 'agent-1', status: 'pending' }]) // reset request lookup
      .mockImplementationOnce(async () => [{ role: 'agent' }]) // target profile lookup

    const res = await POST(makeRequest({ request_id: 'req-1', action: 'approve' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.temp_password).toBeTruthy()
  })

  it('returns 401 when the reviewer account itself has been deactivated', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', t2_team: null, full_name: 'X', is_active: false }]) // reviewer lookup
      .mockImplementationOnce(async () => [{ id: 'req-1', profile_id: 'agent-1', status: 'pending' }]) // reset request lookup, only reached if the fix is missing

    const res = await POST(makeRequest({ request_id: 'req-1', action: 'approve' }))

    expect(res.status).toBe(401)
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when the reviewer still has force_password_change set', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', t2_team: null, full_name: 'X', is_active: true, force_password_change: true }])
      .mockImplementationOnce(async () => [{ id: 'req-1', profile_id: 'agent-1', status: 'pending' }])

    const res = await POST(makeRequest({ request_id: 'req-1', action: 'approve' }))

    expect(res.status).toBe(401)
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('lets management approve a reset request targeting an admin', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'management', is_active: true }]) // reviewer lookup
      .mockImplementationOnce(async () => [{ id: 'req-1', profile_id: 'admin-1', status: 'pending' }])
      .mockImplementationOnce(async () => [{ role: 'admin' }]) // target lookup

    const res = await POST(makeRequest({ request_id: 'req-1', action: 'approve' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.temp_password).toBeTruthy()
  })

  it('lets hod approve a reset request targeting a t3 account', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'hod', is_active: true }])
      .mockImplementationOnce(async () => [{ id: 'req-1', profile_id: 't3-1', status: 'pending' }])
      .mockImplementationOnce(async () => [{ role: 't3' }])

    const res = await POST(makeRequest({ request_id: 'req-1', action: 'approve' }))

    expect(res.status).toBe(200)
  })

  it('lets another admin review a qa_analyst-targeted request as a peer', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-2')
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', is_active: true }])
      .mockImplementationOnce(async () => [{ id: 'req-1', profile_id: 'qa-1', status: 'pending' }])
      .mockImplementationOnce(async () => [{ role: 'qa_analyst' }])

    const res = await POST(makeRequest({ request_id: 'req-1', action: 'approve' }))

    expect(res.status).toBe(200)
  })

  it('blocks an admin from reviewing their own password-reset request', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', is_active: true }])
      .mockImplementationOnce(async () => [{ id: 'req-1', profile_id: 'admin-1', status: 'pending' }]) // self
      .mockImplementationOnce(async () => [{ role: 'admin' }])

    const res = await POST(makeRequest({ request_id: 'req-1', action: 'approve' }))

    expect(res.status).toBe(403)
    expect(mockHashPassword).not.toHaveBeenCalled()
  })

  it('still blocks a team_leader from reviewing a t3-targeted request', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'team_leader', is_active: true }])
      .mockImplementationOnce(async () => [{ id: 'req-1', profile_id: 't3-1', status: 'pending' }])
      .mockImplementationOnce(async () => [{ role: 't3' }])

    const res = await POST(makeRequest({ request_id: 'req-1', action: 'approve' }))

    expect(res.status).toBe(403)
  })

  it('blocks management from reviewing an agent-targeted request - that stays team-leader-level', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'management', is_active: true }])
      .mockImplementationOnce(async () => [{ id: 'req-1', profile_id: 'agent-1', status: 'pending' }])
      .mockImplementationOnce(async () => [{ role: 'agent' }])

    const res = await POST(makeRequest({ request_id: 'req-1', action: 'approve' }))

    expect(res.status).toBe(403)
  })
})
