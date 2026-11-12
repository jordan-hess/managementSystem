import {
  canEditCalculatedValue,
  canEditTlTeamSize,
  canEnterKpiActual,
  canEnterManagerSelfRating,
  canEnterManagerWeekly,
  canEnterSourceData,
  canMarkNa,
  canReviewManagerScorecard,
  canSelectTeamLeader,
  canVerifyKpi,
  canViewManagerScorecard,
  canViewTeamLeaderData,
  isHod,
  isManagementTier,
  isPlainAdmin,
  isTeamLeader,
  type LeadOpsViewerContext,
} from './permissions'

// The real-world shape: every actual team leader on SIT is role='admin'
// with a team_leaders row, not role='team_leader'.
const realTeamLeader: LeadOpsViewerContext = { role: 'admin', hasTeamRow: true, profileId: 'tl-1' }
const plainAdmin: LeadOpsViewerContext = { role: 'admin', hasTeamRow: false, profileId: 'admin-1' }
const management: LeadOpsViewerContext = { role: 'management', hasTeamRow: false, profileId: 'mgmt-1' }
const hod: LeadOpsViewerContext = { role: 'hod', hasTeamRow: false, profileId: 'hod-1' }
const agent: LeadOpsViewerContext = { role: 'agent', hasTeamRow: false, profileId: 'agent-1' }
// The role value is supported even though nothing on SIT currently has it.
const explicitTeamLeaderRole: LeadOpsViewerContext = { role: 'team_leader', hasTeamRow: false, profileId: 'tl-explicit' }

// The real Manager Scorecard pairing — the manager herself vs. a different
// management-tier reviewer vs. a third management-tier viewer who is
// neither.
const ALEX_ID = '93cfcee9-09af-48a9-a1d8-149a09149d66'
const alexCtx: LeadOpsViewerContext = { role: 'management', hasTeamRow: false, profileId: ALEX_ID }
// Sam's REAL SIT role is 'management', not 'hod' (left that way deliberately
// — see docs/manager-scorecard.md) — so with reviewer feedback now HOD-only,
// he reads the scorecard but can't act as reviewer under his current role.
const samCtx: LeadOpsViewerContext = { role: 'management', hasTeamRow: false, profileId: '857b0793-002f-489c-924f-d91071ef454c' }
const otherManagementCtx: LeadOpsViewerContext = { role: 'management', hasTeamRow: false, profileId: 'some-other-manager' }
const hodReviewerCtx: LeadOpsViewerContext = { role: 'hod', hasTeamRow: false, profileId: 'hod-reviewer-1' }

describe('isTeamLeader — the real-world-shape check this whole module exists for', () => {
  it('is true for an admin who leads a team, which is what every real team leader actually is', () => {
    expect(isTeamLeader(realTeamLeader)).toBe(true)
  })

  it('is true for an explicit team_leader role too, even though nothing on SIT has it yet', () => {
    expect(isTeamLeader(explicitTeamLeaderRole)).toBe(true)
  })

  it('is false for an admin with no team', () => {
    expect(isTeamLeader(plainAdmin)).toBe(false)
  })
})

describe('isPlainAdmin — must exclude real team leaders', () => {
  it('is false for an admin who leads a team — they are a Team Leader, not a plain Admin', () => {
    // This is the exact bug the matrix was redesigned to avoid: keying off
    // profiles.role alone would make every real team leader a plain Admin.
    expect(isPlainAdmin(realTeamLeader)).toBe(false)
  })

  it('is true for an admin with no team', () => {
    expect(isPlainAdmin(plainAdmin)).toBe(true)
  })
})

describe('isManagementTier', () => {
  it('includes both management and hod', () => {
    expect(isManagementTier(management)).toBe(true)
    expect(isManagementTier(hod)).toBe(true)
  })

  it('excludes team leaders and plain admins', () => {
    expect(isManagementTier(realTeamLeader)).toBe(false)
    expect(isManagementTier(plainAdmin)).toBe(false)
  })
})

describe('isHod — the HOD-only dashboard gate', () => {
  it('is true only for hod, not for management', () => {
    expect(isHod(hod)).toBe(true)
    expect(isHod(management)).toBe(false)
  })
})

describe('canViewTeamLeaderData — the privacy gate: is anyone else’s data visible at all', () => {
  it('a Team Leader sees their own', () => {
    expect(canViewTeamLeaderData(realTeamLeader)).toBe(true)
  })

  it('Management and hod see everyone', () => {
    expect(canViewTeamLeaderData(management)).toBe(true)
    expect(canViewTeamLeaderData(hod)).toBe(true)
  })

  it('a plain Admin sees NOTHING — Data Entry and Performance Reviews are private per team leader, and Admin no longer has a side door in', () => {
    expect(canViewTeamLeaderData(plainAdmin)).toBe(false)
  })
})

describe('canSelectTeamLeader — Management/hod only, since Admin no longer sees any team leader’s data', () => {
  it('lets Management and hod pick any team leader', () => {
    expect(canSelectTeamLeader(management)).toBe(true)
    expect(canSelectTeamLeader(hod)).toBe(true)
  })

  it('does not let a Team Leader pick — they only see themselves', () => {
    expect(canSelectTeamLeader(realTeamLeader)).toBe(false)
  })

  it('does not let a plain Admin pick — the revoked capability', () => {
    expect(canSelectTeamLeader(plainAdmin)).toBe(false)
  })
})

describe('canEnterSourceData — daily activity, weekly manual, time & motion, unplanned work', () => {
  it('the Team Leader can enter their own', () => {
    expect(canEnterSourceData(realTeamLeader)).toBe(true)
  })

  it('Admin can no longer enter on a team leader’s behalf — this capability was revoked for privacy', () => {
    expect(canEnterSourceData(plainAdmin)).toBe(false)
  })

  it('Management does NOT enter source data — review and verification only', () => {
    expect(canEnterSourceData(management)).toBe(false)
  })
})

describe('canEnterKpiActual — TL enters their own, Management corrects; Admin cannot', () => {
  it('the Team Leader and Management can enter/correct an actual', () => {
    expect(canEnterKpiActual(realTeamLeader)).toBe(true)
    expect(canEnterKpiActual(management)).toBe(true)
  })

  it('a plain Admin cannot — same privacy narrowing as canEnterSourceData', () => {
    expect(canEnterKpiActual(plainAdmin)).toBe(false)
  })

  it('a bare agent cannot', () => {
    expect(canEnterKpiActual(agent)).toBe(false)
  })
})

describe('canMarkNa mirrors canEnterKpiActual', () => {
  it('is the identical predicate — N/A is a property of an enterable actual', () => {
    expect(canMarkNa).toBe(canEnterKpiActual)
  })
})

describe('canEnterManagerWeekly — Management-only', () => {
  it('is true for management and hod, false for everyone else', () => {
    expect(canEnterManagerWeekly(management)).toBe(true)
    expect(canEnterManagerWeekly(hod)).toBe(true)
    expect(canEnterManagerWeekly(realTeamLeader)).toBe(false)
    expect(canEnterManagerWeekly(plainAdmin)).toBe(false)
  })
})

describe('canVerifyKpi — the rule the brief is explicit about: Admin must NOT verify', () => {
  it('Management (and hod) can verify', () => {
    expect(canVerifyKpi(management)).toBe(true)
    expect(canVerifyKpi(hod)).toBe(true)
  })

  it('a real Team Leader cannot verify their own actual', () => {
    expect(canVerifyKpi(realTeamLeader)).toBe(false)
  })

  it('Admin cannot verify — deliberately narrower than Management, per the brief', () => {
    expect(canVerifyKpi(plainAdmin)).toBe(false)
  })
})

describe('canEditCalculatedValue — always false, for every role including hod', () => {
  it.each([realTeamLeader, plainAdmin, management, hod, agent])(
    'is false for %o',
    (ctx) => {
      expect(canEditCalculatedValue(ctx)).toBe(false)
    },
  )
})

describe('canViewManagerScorecard — instance-based: the manager herself, or anyone management-tier', () => {
  it('the manager sees her own scorecard', () => {
    expect(canViewManagerScorecard(alexCtx, ALEX_ID)).toBe(true)
  })

  it('another management-tier viewer (the reviewer, or anyone else) sees it too', () => {
    expect(canViewManagerScorecard(samCtx, ALEX_ID)).toBe(true)
    expect(canViewManagerScorecard(otherManagementCtx, ALEX_ID)).toBe(true)
    expect(canViewManagerScorecard(hod, ALEX_ID)).toBe(true)
  })

  it('a Team Leader or plain Admin does not see someone else\'s manager scorecard', () => {
    expect(canViewManagerScorecard(realTeamLeader, ALEX_ID)).toBe(false)
    expect(canViewManagerScorecard(plainAdmin, ALEX_ID)).toBe(false)
  })
})

describe('canEnterManagerSelfRating — the manager only, nobody else', () => {
  it('is true only for the manager herself', () => {
    expect(canEnterManagerSelfRating(alexCtx, ALEX_ID)).toBe(true)
  })

  it('is false for the reviewer and for any other management-tier viewer', () => {
    expect(canEnterManagerSelfRating(samCtx, ALEX_ID)).toBe(false)
    expect(canEnterManagerSelfRating(otherManagementCtx, ALEX_ID)).toBe(false)
    expect(canEnterManagerSelfRating(hod, ALEX_ID)).toBe(false)
  })

  it('has no hardcoded test-account allowance: only the configured manager can self-rate (the old SIT-only sitmgmt id is gone)', () => {
    const formerSitAllowance: LeadOpsViewerContext = { role: 'management', hasTeamRow: false, profileId: '1d9fa8df-0c69-4b26-a7d7-18788698f908' }
    expect(canEnterManagerSelfRating(formerSitAllowance, ALEX_ID)).toBe(false)
  })
})

describe('canReviewManagerScorecard — HOD only, and never the manager reviewing herself', () => {
  it('an HOD viewer can review', () => {
    expect(canReviewManagerScorecard(hod, ALEX_ID)).toBe(true)
    expect(canReviewManagerScorecard(hodReviewerCtx, ALEX_ID)).toBe(true)
  })

  it('a plain management-tier viewer cannot review — reviewer feedback is an HOD responsibility, not a general Management one', () => {
    expect(canReviewManagerScorecard(samCtx, ALEX_ID)).toBe(false)
    expect(canReviewManagerScorecard(otherManagementCtx, ALEX_ID)).toBe(false)
  })

  it('the manager herself cannot review/lock her own scorecard, even if she were somehow also hod', () => {
    expect(canReviewManagerScorecard(alexCtx, ALEX_ID)).toBe(false)
    expect(canReviewManagerScorecard({ ...alexCtx, role: 'hod' }, ALEX_ID)).toBe(false)
  })

  it('a Team Leader or plain Admin cannot review', () => {
    expect(canReviewManagerScorecard(realTeamLeader, ALEX_ID)).toBe(false)
    expect(canReviewManagerScorecard(plainAdmin, ALEX_ID)).toBe(false)
  })
})

describe('canEditTlTeamSize — management-tier, including the manager herself', () => {
  it('is true for the manager and for any other management-tier viewer', () => {
    expect(canEditTlTeamSize(alexCtx)).toBe(true)
    expect(canEditTlTeamSize(samCtx)).toBe(true)
    expect(canEditTlTeamSize(hod)).toBe(true)
  })

  it('is false for a Team Leader or plain Admin', () => {
    expect(canEditTlTeamSize(realTeamLeader)).toBe(false)
    expect(canEditTlTeamSize(plainAdmin)).toBe(false)
  })
})
