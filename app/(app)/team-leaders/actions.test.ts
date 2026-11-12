jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/db/tx', () => ({ withTransaction: jest.fn() }))
jest.mock('@/lib/auth/getCurrentUserId', () => ({ getCurrentUserId: jest.fn() }))

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { moveToLeaderSlot, updatePersonProfile, deleteUserAccount, toggleProfileActive, createTeam, renameTeam } from './actions'

const mockSql = sql as unknown as jest.Mock
const mockWithTransaction = withTransaction as jest.Mock
const mockGetCurrentUserId = getCurrentUserId as jest.Mock

beforeEach(() => {
  mockSql.mockReset()
  mockWithTransaction.mockReset()
  mockGetCurrentUserId.mockReset()
})

describe('duplicate-value errors name the field', () => {
  const uniqueViolation = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })

  it('createTeam tags a duplicate team name with field "name"', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql.mockResolvedValueOnce([{ role: 'admin' }]).mockRejectedValueOnce(uniqueViolation)
    expect(await createTeam('Alpha', 'blue')).toEqual({ error: 'A team with that name already exists.', field: 'name' })
  })

  it('renameTeam tags a duplicate team name with field "name"', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql.mockResolvedValueOnce([{ role: 'admin' }]).mockRejectedValueOnce(uniqueViolation)
    expect(await renameTeam('t1', 'Alpha')).toEqual({ error: 'A team with that name already exists.', field: 'name' })
  })

  it('createTeam leaves other failures without a field', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql.mockResolvedValueOnce([{ role: 'admin' }]).mockRejectedValueOnce(new Error('db down'))
    expect(await createTeam('Alpha', 'blue')).toEqual({ error: 'db down' })
  })

  it('updatePersonProfile tags a duplicate email with field "email"', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql
      .mockResolvedValueOnce([{ role: 'admin' }]) // currentUserAndRole
      .mockResolvedValueOnce([{ full_name: 'X', role: 'agent', department: null }]) // existing
      .mockRejectedValueOnce(uniqueViolation) // UPDATE
    const r = await updatePersonProfile('agent-9', { full_name: 'X', email: 'dup@example.com', department: null, role: 'agent' })
    expect(r).toEqual({ error: 'Another account already uses that email.', field: 'email' })
  })
})

describe('moveToLeaderSlot — self-role-escalation guard', () => {
  it('blocks an admin from promoting-and-assigning their own account as a team leader', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql.mockResolvedValueOnce([{ role: 'admin' }]) // currentUserAndRole

    const result = await moveToLeaderSlot('admin-1', 'team-2', 'agent')

    expect(result).toEqual({ error: 'You cannot change your own role.' })
    expect(mockSql).toHaveBeenCalledTimes(1) // no promotion UPDATE, no transaction
    expect(mockWithTransaction).not.toHaveBeenCalled()
  })

  it('still lets an admin promote and assign a DIFFERENT person as team leader', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql
      .mockResolvedValueOnce([{ role: 'admin' }]) // currentUserAndRole
      .mockResolvedValueOnce([]) // promotion UPDATE, result unused
    mockWithTransaction.mockImplementation(async (fn) => fn(mockSql))

    const result = await moveToLeaderSlot('agent-9', 'team-2', 'agent')

    expect(result).toEqual({ success: true })
  })

  it('denies a caller who is not admin/management from assigning a team leader', async () => {
    mockGetCurrentUserId.mockResolvedValue('tl-1')
    mockSql.mockResolvedValueOnce([{ role: 'team_leader' }])

    const result = await moveToLeaderSlot('agent-9', 'team-2', 'agent')

    expect(result).toEqual({ error: 'You do not have permission to assign team leaders.' })
  })
})

describe('qa_analyst holds the admin tier on Team Management', () => {
  beforeEach(() => mockGetCurrentUserId.mockResolvedValue('qa-1'))

  it('can promote and assign a different person as team leader', async () => {
    mockSql
      .mockResolvedValueOnce([{ role: 'qa_analyst' }]) // currentUserAndRole
      .mockResolvedValueOnce([]) // promote UPDATE
    mockWithTransaction.mockResolvedValueOnce(undefined)

    expect(await moveToLeaderSlot('agent-9', 'team-2', 'agent')).toEqual({ success: true })
  })

  it('cannot promote their own account', async () => {
    mockSql.mockResolvedValueOnce([{ role: 'qa_analyst' }])
    expect(await moveToLeaderSlot('qa-1', 'team-2', 'qa_analyst')).toEqual({ error: 'You cannot change your own role.' })
  })

  it("can change another person's role, name and department", async () => {
    mockSql
      .mockResolvedValueOnce([{ role: 'qa_analyst' }])
      .mockResolvedValueOnce([{ full_name: 'Old', role: 'agent', department: null }])
      .mockResolvedValueOnce([])

    const result = await updatePersonProfile('agent-9', { full_name: 'New', email: 'n@example.com', department: 'Social', role: 'management' })

    expect(result).toEqual({ success: true })
    const updateCall = mockSql.mock.calls[2]
    expect(updateCall[1]).toBe('New')
    expect(updateCall[3]).toBe('Social')
    expect(updateCall[4]).toBe('management')
  })

  it('can delete a management account', async () => {
    mockSql
      .mockResolvedValueOnce([{ role: 'qa_analyst' }])
      .mockResolvedValueOnce([{ role: 'management' }])
      .mockResolvedValueOnce([])

    expect(await deleteUserAccount('mgr-1')).toEqual({ success: true })
  })

  it('can deactivate a profile and create a team', async () => {
    mockSql.mockResolvedValueOnce([{ role: 'qa_analyst' }]).mockResolvedValueOnce([])
    expect(await toggleProfileActive('agent-1', true)).toEqual({ success: true })

    mockSql.mockResolvedValueOnce([{ role: 'qa_analyst' }]).mockResolvedValueOnce([{ id: 't9', name: 'Purple' }])
    expect(await createTeam('Purple', 'blue')).toEqual({ data: { id: 't9', name: 'Purple' } })
  })
})

describe('updatePersonProfile — self-role-escalation guard', () => {
  const input = { full_name: 'New Name', email: 'new@example.com', department: null, role: 'admin' as const }

  it('holds the role at its existing value when an admin edits their own profile, even if a different role was requested', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql
      .mockResolvedValueOnce([{ role: 'admin' }]) // currentUserAndRole
      .mockResolvedValueOnce([{ full_name: 'Old Name', role: 'admin', department: null }]) // existing profile lookup
      .mockResolvedValueOnce([]) // UPDATE

    const result = await updatePersonProfile('admin-1', input)

    expect(result).toEqual({ success: true })
    const updateCall = mockSql.mock.calls[2]
    // The UPDATE's bound values are the sql template's substitution args,
    // in column order: full_name, email, department, role, id.
    expect(updateCall[4]).toBe('admin') // role stayed at the existing value
  })

  it('lets an admin change a DIFFERENT person\'s role', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql
      .mockResolvedValueOnce([{ role: 'admin' }])
      .mockResolvedValueOnce([{ full_name: 'Old Name', role: 'agent', department: null }])
      .mockResolvedValueOnce([])

    const result = await updatePersonProfile('agent-9', input)

    expect(result).toEqual({ success: true })
    const updateCall = mockSql.mock.calls[2]
    expect(updateCall[4]).toBe('admin') // input.role applied since it's not a self-edit
  })

  it('holds role/department/full_name at existing values for a team_leader-tier caller, even editing someone else', async () => {
    mockGetCurrentUserId.mockResolvedValue('tl-1')
    mockSql
      .mockResolvedValueOnce([{ role: 'team_leader' }])
      .mockResolvedValueOnce([{ full_name: 'Existing Name', role: 'agent', department: 'Support' }])
      .mockResolvedValueOnce([])

    const result = await updatePersonProfile('agent-9', input)

    expect(result).toEqual({ success: true })
    const updateCall = mockSql.mock.calls[2]
    expect(updateCall[1]).toBe('Existing Name') // full_name held
    expect(updateCall[3]).toBe('Support') // department held
    expect(updateCall[4]).toBe('agent') // role held - team_leader can't grant admin/management
  })
})

describe('deleteUserAccount — tier restriction and self-delete guard', () => {
  it('blocks deleting your own account, even as an admin', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql.mockResolvedValueOnce([{ role: 'admin' }])

    const result = await deleteUserAccount('admin-1')

    expect(result).toEqual({ error: 'You cannot delete your own account.' })
  })

  it('blocks a team_leader-tier caller from deleting an admin/management account', async () => {
    mockGetCurrentUserId.mockResolvedValue('tl-1')
    mockSql
      .mockResolvedValueOnce([{ role: 'team_leader' }]) // currentUserAndRole
      .mockResolvedValueOnce([{ role: 'admin' }]) // target lookup

    const result = await deleteUserAccount('admin-2')

    expect(result).toEqual({ error: 'Only admins or management can delete this account.' })
  })

  it('lets a team_leader-tier caller delete a plain agent account', async () => {
    mockGetCurrentUserId.mockResolvedValue('tl-1')
    mockSql
      .mockResolvedValueOnce([{ role: 'team_leader' }])
      .mockResolvedValueOnce([{ role: 'agent' }])
      .mockResolvedValueOnce([])

    const result = await deleteUserAccount('agent-9')

    expect(result).toEqual({ success: true })
  })

  it('hard-deletes the profile row instead of deactivating it', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql
      .mockResolvedValueOnce([{ role: 'admin' }])
      .mockResolvedValueOnce([{ role: 'agent' }])
      .mockResolvedValueOnce([])

    await deleteUserAccount('agent-9')

    const [strings, ...values] = mockSql.mock.calls[2]
    expect(strings.join('?')).toMatch(/DELETE FROM profiles WHERE id = \?/)
    expect(values).toEqual(['agent-9'])
  })

  it('reports a blocking foreign key without leaking the raw Postgres error', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql
      .mockResolvedValueOnce([{ role: 'admin' }])
      .mockResolvedValueOnce([{ role: 'agent' }])
      .mockRejectedValueOnce(Object.assign(new Error('violates foreign key constraint'), { code: '23503' }))

    const result = await deleteUserAccount('agent-9')

    expect(result).toEqual({ error: 'This account is still referenced by records that block deletion — deactivate it instead and contact support.' })
  })
})

describe('toggleProfileActive — admin/management gate', () => {
  it('denies a team_leader', async () => {
    mockGetCurrentUserId.mockResolvedValue('tl-1')
    mockSql.mockResolvedValueOnce([{ role: 'team_leader' }])

    const result = await toggleProfileActive('agent-1', true)

    expect(result).toEqual({ error: 'You do not have permission to perform this action.' })
  })

  it('allows an admin', async () => {
    mockGetCurrentUserId.mockResolvedValue('admin-1')
    mockSql
      .mockResolvedValueOnce([{ role: 'admin' }])
      .mockResolvedValueOnce([])

    const result = await toggleProfileActive('agent-1', true)

    expect(result).toEqual({ success: true })
  })
})
