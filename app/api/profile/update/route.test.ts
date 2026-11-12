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
  return new Request('http://localhost/api/profile/update', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/profile/update', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockGetCurrentUserId.mockReset()
    mockHashPassword.mockReset()
    mockGetCurrentUserId.mockResolvedValue('user-1')
    mockHashPassword.mockResolvedValue('mock-hash')
  })

  it('returns 401 when the caller account has been deactivated', async () => {
    mockSql.mockImplementationOnce(async () => [{ role: 'agent', t2_team: null, full_name: 'X', is_active: false }]) // requireUser()'s lookup

    const res = await POST(makeRequest({ full_name: 'New Name' }))

    expect(res.status).toBe(401)
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('still updates the profile for an active user', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'agent', t2_team: null, full_name: 'X', is_active: true }]) // requireUser()'s lookup
      .mockImplementationOnce(() => ({})) // sql(updates) dynamic column-list helper
      .mockImplementationOnce(async () => undefined) // the UPDATE itself

    const res = await POST(makeRequest({ full_name: 'New Name' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
  })

  it('still updates the profile for a caller with force_password_change set - this route is the ONLY way to clear that flag, so it must never be gated on it', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'agent', t2_team: null, full_name: 'X', is_active: true, force_password_change: true }])
      .mockImplementationOnce(() => ({}))
      .mockImplementationOnce(async () => undefined)

    const res = await POST(makeRequest({ password: 'a-new-password', clear_force_password_change: true }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
  })
})
