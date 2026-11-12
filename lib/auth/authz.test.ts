jest.mock('@/lib/db/pool', () => ({ sql: jest.fn() }))

import { sql } from '@/lib/db/pool'
import {
  isAdminOrManagement,
  isTeamLeaderOrAbove,
  isQaReviewer,
  qaReviewCanView,
  qaReviewCanCreate,
  qaReviewCanEdit,
  qaReviewCanDelete,
  canViewFullRoster,
  canAccessTeamManagement,
  canAdministerTeamManagement,
  canManageQueueAssignment,
  warningsCanView,
  isTeamLeaderFor,
  isSubmitterTeamLeader,
  type Role,
} from './authz'

const mockSql = sql as unknown as jest.Mock

const ALL_ROLES: Role[] = ['agent', 'admin', 'management', 'team_leader', 't3', 'qa_analyst', 'hod']

describe('isAdminOrManagement', () => {
  it('is true for admin, management, and hod', () => {
    expect(isAdminOrManagement('admin')).toBe(true)
    expect(isAdminOrManagement('management')).toBe(true)
    expect(isAdminOrManagement('hod')).toBe(true)
  })

  it('is false for every other role', () => {
    for (const role of ALL_ROLES.filter(r => !['admin', 'management', 'hod'].includes(r))) {
      expect(isAdminOrManagement(role)).toBe(false)
    }
  })
})

describe('isTeamLeaderOrAbove', () => {
  it('is true for team_leader plus everything isAdminOrManagement covers', () => {
    expect(isTeamLeaderOrAbove('team_leader')).toBe(true)
    expect(isTeamLeaderOrAbove('admin')).toBe(true)
    expect(isTeamLeaderOrAbove('management')).toBe(true)
    expect(isTeamLeaderOrAbove('hod')).toBe(true)
  })

  it('is false for agent, t3, and qa_analyst', () => {
    expect(isTeamLeaderOrAbove('agent')).toBe(false)
    expect(isTeamLeaderOrAbove('t3')).toBe(false)
    expect(isTeamLeaderOrAbove('qa_analyst')).toBe(false)
  })
})

describe('isQaReviewer', () => {
  it('is true for qa_analyst, team_leader, and admin/management/hod', () => {
    expect(isQaReviewer('qa_analyst')).toBe(true)
    expect(isQaReviewer('team_leader')).toBe(true)
    expect(isQaReviewer('admin')).toBe(true)
    expect(isQaReviewer('management')).toBe(true)
    expect(isQaReviewer('hod')).toBe(true)
  })

  it('deliberately excludes t3, even though it is otherwise a T2 escalation role', () => {
    expect(isQaReviewer('t3')).toBe(false)
  })

  it('is false for a plain agent', () => {
    expect(isQaReviewer('agent')).toBe(false)
  })
})

describe('qaReviewCanView', () => {
  it('lets an agent view their own review even though they are not a QA reviewer', () => {
    expect(qaReviewCanView('agent-1', 'agent', 'agent-1')).toBe(true)
  })

  it('blocks an agent from viewing a different agent\'s review', () => {
    expect(qaReviewCanView('agent-1', 'agent', 'agent-2')).toBe(false)
  })

  it('lets a qa_analyst view any agent\'s review', () => {
    expect(qaReviewCanView('qa-1', 'qa_analyst', 'agent-2')).toBe(true)
  })
})

describe('qaReviewCanCreate', () => {
  it('mirrors isQaReviewer', () => {
    expect(qaReviewCanCreate('qa_analyst')).toBe(true)
    expect(qaReviewCanCreate('agent')).toBe(false)
  })
})

describe('qaReviewCanEdit', () => {
  it('lets the original reviewer edit their own review', () => {
    expect(qaReviewCanEdit('qa-1', 'qa_analyst', 'qa-1')).toBe(true)
  })

  it('blocks a different qa_analyst from editing someone else\'s review', () => {
    expect(qaReviewCanEdit('qa-2', 'qa_analyst', 'qa-1')).toBe(false)
  })

  it('lets admin/management edit any review regardless of who wrote it', () => {
    expect(qaReviewCanEdit('admin-1', 'admin', 'qa-1')).toBe(true)
  })
})

describe('qaReviewCanDelete', () => {
  it('lets the author delete their own review', () => {
    expect(qaReviewCanDelete('qa-1', 'qa_analyst', 'qa-1')).toBe(true)
  })

  it("blocks a different qa_analyst from deleting someone else's review", () => {
    expect(qaReviewCanDelete('qa-2', 'qa_analyst', 'qa-1')).toBe(false)
  })

  it('blocks an author who no longer holds a QA reviewer role', () => {
    expect(qaReviewCanDelete('qa-1', 'agent', 'qa-1')).toBe(false)
  })

  it('lets admin/management/hod delete any review', () => {
    for (const role of ['admin', 'management', 'hod'] as Role[]) {
      expect(qaReviewCanDelete('x', role, 'qa-1')).toBe(true)
    }
  })
})

describe('canViewFullRoster', () => {
  it('is true for qa_analyst and admin/management/hod only', () => {
    for (const role of ALL_ROLES) {
      expect(canViewFullRoster(role)).toBe(['qa_analyst', 'admin', 'management', 'hod'].includes(role))
    }
  })
})

describe('Team Management page tiers', () => {
  it('canAccessTeamManagement: team_leader, qa_analyst, admin/management/hod', () => {
    for (const role of ALL_ROLES) {
      expect(canAccessTeamManagement(role)).toBe(['team_leader', 'qa_analyst', 'admin', 'management', 'hod'].includes(role))
    }
  })

  it('canAdministerTeamManagement: qa_analyst and admin/management/hod, not team_leader', () => {
    for (const role of ALL_ROLES) {
      expect(canAdministerTeamManagement(role)).toBe(['qa_analyst', 'admin', 'management', 'hod'].includes(role))
    }
  })

  it('canManageQueueAssignment: team_leader, qa_analyst, admin/management/hod', () => {
    for (const role of ALL_ROLES) {
      expect(canManageQueueAssignment(role)).toBe(['team_leader', 'qa_analyst', 'admin', 'management', 'hod'].includes(role))
    }
  })

  it('does not widen the app-wide team-leader tier for qa_analyst', () => {
    expect(isTeamLeaderOrAbove('qa_analyst')).toBe(false)
  })
})

describe('warningsCanView', () => {
  it('lets the agent the warning was issued to view it', () => {
    expect(warningsCanView('agent-1', 'agent', 'agent-1', 'agent')).toBe(true)
  })

  it('blocks a different agent from viewing it', () => {
    expect(warningsCanView('agent-2', 'agent', 'agent-1', 'agent')).toBe(false)
  })

  it('lets management/hod view any warning', () => {
    expect(warningsCanView('mgmt-1', 'management', 'agent-1', 'agent')).toBe(true)
    expect(warningsCanView('hod-1', 'hod', 'agent-1', 'agent')).toBe(true)
  })

  it('lets admin view a warning issued to an agent', () => {
    expect(warningsCanView('admin-1', 'admin', 'agent-1', 'agent')).toBe(true)
  })

  it('blocks admin from viewing a warning issued to a non-agent (e.g. a team_leader)', () => {
    expect(warningsCanView('admin-1', 'admin', 'tl-1', 'team_leader')).toBe(false)
  })

  it('blocks a plain team_leader from viewing another agent\'s warning', () => {
    expect(warningsCanView('tl-1', 'team_leader', 'agent-1', 'agent')).toBe(false)
  })
})

describe('isTeamLeaderFor', () => {
  beforeEach(() => mockSql.mockReset())

  it('is true when a team_leaders row exists for this profile and team', async () => {
    mockSql.mockResolvedValueOnce([{}])
    await expect(isTeamLeaderFor('user-1', 'team-1')).resolves.toBe(true)
  })

  it('is false when no matching row exists', async () => {
    mockSql.mockResolvedValueOnce([])
    await expect(isTeamLeaderFor('user-1', 'team-1')).resolves.toBe(false)
  })
})

describe('isSubmitterTeamLeader', () => {
  beforeEach(() => mockSql.mockReset())

  it('is true when the profile leads any team at all', async () => {
    mockSql.mockResolvedValueOnce([{}])
    await expect(isSubmitterTeamLeader('user-1')).resolves.toBe(true)
  })

  it('is false when the profile leads no team', async () => {
    mockSql.mockResolvedValueOnce([])
    await expect(isSubmitterTeamLeader('user-1')).resolves.toBe(false)
  })
})
