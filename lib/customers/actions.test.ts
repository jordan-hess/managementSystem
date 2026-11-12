jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))
jest.mock('@/lib/auth/requireUser', () => ({ requireUser: jest.fn().mockResolvedValue({ userId: 'u1' }) }))

import { sql } from '@/lib/db/pool'
import { createCustomerAction } from './actions'

const sqlMock = sql as unknown as jest.Mock

describe('createCustomerAction field errors', () => {
  beforeEach(() => sqlMock.mockReset())

  it('tags an invalid phone with field "phone"', async () => {
    const r = await createCustomerAction('A', '082 123', 'a@b.co')
    expect(r).toEqual({ error: expect.stringContaining('numbers only'), field: 'phone' })
  })

  it('tags a missing email with field "email"', async () => {
    const r = await createCustomerAction('A', '0821234567', '  ')
    expect(r).toEqual({ error: 'Email is required.', field: 'email' })
  })

  it('tags a duplicate email with field "email"', async () => {
    sqlMock.mockResolvedValueOnce([{ name: 'Bob', phone: '0820000000' }])
    const r = await createCustomerAction('A', '0821234567', 'a@b.co')
    expect(r).toEqual({ error: expect.stringContaining('already exists'), field: 'email' })
  })

  it('leaves unexpected failures without a field', async () => {
    sqlMock.mockRejectedValueOnce(new Error('db down'))
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = await createCustomerAction('A', '0821234567', 'a@b.co')
    expect(r).toEqual({ error: 'Could not create customer.' })
  })
})
