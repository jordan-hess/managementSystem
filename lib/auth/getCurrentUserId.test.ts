jest.mock('./demoRole', () => ({
  DEFAULT_DEMO_ROLE: 'admin',
  getDemoRole: jest.fn(),
  resolveDemoUserId: jest.fn(),
}))

import { getDemoRole, resolveDemoUserId } from './demoRole'
import { getCurrentUserId } from './getCurrentUserId'

const mockGetDemoRole = getDemoRole as jest.Mock
const mockResolve = resolveDemoUserId as jest.Mock

beforeEach(() => {
  mockGetDemoRole.mockReset()
  mockResolve.mockReset()
})

describe('getCurrentUserId', () => {
  it('resolves the profile for the picked role', async () => {
    mockGetDemoRole.mockResolvedValue('qa_analyst')
    mockResolve.mockResolvedValue('qa-profile')
    await expect(getCurrentUserId()).resolves.toBe('qa-profile')
    expect(mockResolve).toHaveBeenCalledWith('qa_analyst')
  })

  it('falls back to the default role before one is picked', async () => {
    mockGetDemoRole.mockResolvedValue(null)
    mockResolve.mockResolvedValue('admin-profile')
    await expect(getCurrentUserId()).resolves.toBe('admin-profile')
    expect(mockResolve).toHaveBeenCalledWith('admin')
  })

  it('returns null when no profile has that role', async () => {
    mockGetDemoRole.mockResolvedValue('hod')
    mockResolve.mockResolvedValue(null)
    await expect(getCurrentUserId()).resolves.toBeNull()
  })
})
