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
  return new Request('http://localhost/api/admin/create-user', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/create-user', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockGetCurrentUserId.mockReset()
    mockHashPassword.mockReset()
    mockGetCurrentUserId.mockResolvedValue('caller-1')
    mockHashPassword.mockResolvedValue('mock-hash')
  })

  it('returns 401 when the caller account has been deactivated, even though role would otherwise be allowed', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', t2_team: null, full_name: 'X', is_active: false }]) // caller lookup
      .mockImplementationOnce(async () => []) // existing-email check, only reached if the fix is missing

    const res = await POST(
      makeRequest({ email: 'new@example.com', full_name: 'New Agent', password: 'password123', role: 'agent' })
    )

    expect(res.status).toBe(401)
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when the caller still has force_password_change set, even though role would otherwise be allowed', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', t2_team: null, full_name: 'X', is_active: true, force_password_change: true }])
      .mockImplementationOnce(async () => [])

    const res = await POST(
      makeRequest({ email: 'new@example.com', full_name: 'New Agent', password: 'password123', role: 'agent' })
    )

    expect(res.status).toBe(401)
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('still allows an active admin to create a user', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', is_active: true }]) // caller lookup
      .mockImplementationOnce(async () => []) // existing-email check: no existing user

    const res = await POST(
      makeRequest({ email: 'new@example.com', full_name: 'New Agent', password: 'password123', role: 'agent' })
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
  })

  it('tags a duplicate email with field "email"', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', is_active: true }]) // caller lookup
      .mockImplementationOnce(async () => [{ id: 'existing-1' }]) // existing-email check: found

    const res = await POST(makeRequest({ email: 'dup@example.com', full_name: 'Dup', role: 'agent' }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json).toEqual({ error: 'A user with that email already exists.', field: 'email' })
  })

  it('tags a malformed email with field "email"', async () => {
    mockSql.mockImplementationOnce(async () => [{ role: 'admin', is_active: true }]) // caller lookup

    const res = await POST(makeRequest({ email: 'not-an-email', full_name: 'Bad', role: 'agent' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json).toEqual({ error: 'Invalid email address.', field: 'email' })
  })

  it('creates an agent with the fixed default password, ignoring whatever password was submitted, and sets force_password_change', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', is_active: true }]) // caller lookup
      .mockImplementationOnce(async () => []) // existing-email check
      .mockImplementationOnce(async () => []) // INSERT

    const res = await POST(
      makeRequest({ email: 'new-agent@example.com', full_name: 'New Agent', password: 'whatever-they-typed', role: 'agent' })
    )

    expect(res.status).toBe(200)
    expect(mockHashPassword).toHaveBeenCalledWith('demo-agent-pass')
    const insertCall = mockSql.mock.calls[2]
    expect(insertCall[8]).toBe(true) // force_password_change
  })

  it('creates a management account with the fixed staff default password and force_password_change', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', is_active: true }])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [])

    const res = await POST(
      makeRequest({ email: 'new-mgmt@example.com', full_name: 'New Manager', password: 'irrelevant', role: 'management' })
    )

    expect(res.status).toBe(200)
    expect(mockHashPassword).toHaveBeenCalledWith('demo-staff-pass')
    const insertCall = mockSql.mock.calls[2]
    expect(insertCall[8]).toBe(true)
  })

  it('creates an hod account with the same staff default password', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', is_active: true }])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [])

    await POST(makeRequest({ email: 'new-hod@example.com', full_name: 'New HOD', password: 'irrelevant', role: 'hod' }))

    expect(mockHashPassword).toHaveBeenCalledWith('demo-staff-pass')
  })

  it('creates an admin account with the fixed staff default password too, no password field required at all', async () => {
    mockSql
      .mockImplementationOnce(async () => [{ role: 'admin', is_active: true }])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [])

    const res = await POST(
      makeRequest({ email: 'new-admin@example.com', full_name: 'New Admin', role: 'admin' })
    )

    expect(res.status).toBe(200)
    expect(mockHashPassword).toHaveBeenCalledWith('demo-staff-pass')
    const insertCall = mockSql.mock.calls[2]
    expect(insertCall[8]).toBe(true) // force_password_change
  })
})
