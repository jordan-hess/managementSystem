/**
 * leadOps Data Entry — the role/ownership matrix, as pure predicates.
 *
 * "Team Leader is not a role on this system": SIT has zero profiles with
 * role = 'team_leader'. Every real team leader (Taylor, Jamie, Casey,
 * Riley, Avery) is role = 'admin' with a row in `team_leaders` — the
 * shape CLAUDE.md documents ("team leader access is usually layered on an
 * admin profile via a team_leaders table row"). So `isTeamLeader` below
 * checks BOTH the (unused but supported) role value and team_leaders
 * membership, and `isPlainAdmin` is only true for an admin who is NOT one —
 * otherwise every real team leader would be classified as a plain Admin, and
 * nobody would ever see the Team Leader view.
 *
 * These are Phase-0 WORKFLOW rules, not production authorization — kept
 * local to leadOps rather than in lib/auth/authz.ts on purpose. No new
 * database permissions, migrations or middleware; the page resolves
 * `hasTeamRow` once via the existing isSubmitterTeamLeader
 * (lib/auth/authz.ts) and passes it down as a boolean, the same
 * never-re-derive-role-in-the-client convention every other opsHub page
 * follows.
 *
 * NOT permission gates in the security sense — nothing here blocks a
 * request. They drive which controls the UI renders and enables, exactly as
 * the brief asks ("a UI/workflow distinction for testing, not a new
 * production authorization system").
 *
 * PRIVACY (2026-09-27): each team leader's Data Entry and Performance Review
 * is private to that team leader. Only Management (and HOD) can see every
 * team leader's data — Admin's earlier "select any team leader and enter on
 * their behalf" capability is REVOKED. A plain Admin (role='admin', no
 * team_leaders row) now sees neither a team-leader picker nor any team
 * leader's data on this page — see canViewTeamLeaderData, which
 * DataEntryTab.tsx/PerformanceReviewTab.tsx check before rendering anything
 * beyond an explicit "no access" state. This is a deliberate narrowing of
 * the original brief's Admin section; Admin is effectively parked here
 * until a real capability is defined for it.
 */

import type { Role } from '@/types'

export interface LeadOpsViewerContext {
  role: Role
  /** Whether this profile has a team_leaders row — the real-world "is a team leader" signal. */
  hasTeamRow: boolean
  /** The viewer's own real profile id — needed for the Manager Scorecard's INSTANCE checks ("is this viewer actually the manager being scored"), which role-class predicates alone can't answer. Every other predicate in this file ignores it. */
  profileId: string
}

/** True for both shapes: an explicit team_leader role (supported, unused today) and the real admin+team_leaders shape. */
export function isTeamLeader(ctx: LeadOpsViewerContext): boolean {
  return ctx.role === 'team_leader' || ctx.hasTeamRow
}

/** An admin who is NOT a team leader — the operational-support shape. */
export function isPlainAdmin(ctx: LeadOpsViewerContext): boolean {
  return ctx.role === 'admin' && !isTeamLeader(ctx)
}

export function isManagementTier(ctx: LeadOpsViewerContext): boolean {
  return ctx.role === 'management' || ctx.role === 'hod'
}

/** Whether the viewer sees the full HOD dashboard (Planner/Weekly Log/Scorecard/Reviews) vs Data Entry + their own review only. */
export function isHod(ctx: LeadOpsViewerContext): boolean {
  return ctx.role === 'hod'
}

// ─── Visibility ───────────────────────────────────────────────────────────

/**
 * Whether this viewer sees ANY team-leader-scoped data at all — their own
 * (Team Leader) or everyone's (Management/HOD). False for a plain Admin,
 * which is exactly the point: Data Entry and Performance Reviews are
 * private to each team leader, and Admin no longer gets a side door in.
 * Call sites use this to decide between rendering real content and an
 * explicit "no access" state — never the MOCK_TEAM_LEADERS[0] fallback,
 * which exists for the Team Leader "this is your own record" case and would
 * otherwise leak someone else's data to a plain Admin.
 */
export function canViewTeamLeaderData(ctx: LeadOpsViewerContext): boolean {
  return isTeamLeader(ctx) || isManagementTier(ctx)
}

// ─── Source-data entry ───────────────────────────────────────────────────

/** Only Management/HOD can pick a team leader to view — a Team Leader always sees their own, and Admin sees none. */
export function canSelectTeamLeader(ctx: LeadOpsViewerContext): boolean {
  return isManagementTier(ctx)
}

/** Daily activity, weekly manual fields (calibration/re-audits), Time & Motion actuals and unplanned work — the TL's own operational record. Admin no longer enters on a team leader's behalf. */
export function canEnterSourceData(ctx: LeadOpsViewerContext): boolean {
  return isTeamLeader(ctx)
}

/** KPI actuals: TL enters their own; Management corrects too (as part of verification). Admin cannot — same privacy narrowing as canEnterSourceData. Never HOD-only — HOD reviews calculated results, not source data. */
export function canEnterKpiActual(ctx: LeadOpsViewerContext): boolean {
  return isTeamLeader(ctx) || isManagementTier(ctx)
}

/** N/A is a property of an enterable KPI actual, so the same people who can enter a value can mark it N/A. */
export const canMarkNa = canEnterKpiActual

// ─── Management-only ─────────────────────────────────────────────────────

/** Interactions sampled / calibration spot-check / TL 1:1s — Management's own weekly record, not the TL's. */
export function canEnterManagerWeekly(ctx: LeadOpsViewerContext): boolean {
  return isManagementTier(ctx)
}

/**
 * Verify (or correct-and-verify) a KPI actual. Deliberately Management-tier
 * only — the brief is explicit that Admin "must NOT" be given this, to keep
 * Admin's role narrow rather than inventing further Admin business rules.
 */
export function canVerifyKpi(ctx: LeadOpsViewerContext): boolean {
  return isManagementTier(ctx)
}

// ─── Never, for anyone ───────────────────────────────────────────────────

/**
 * No role — not even HOD — may hand-edit a calculated value: KPI score,
 * RAG band, category/overall aggregate, planner adherence, % time on
 * coaching & support, or a weekly rollup. Exists as a single named
 * predicate (always false) so a call site reads as a deliberate assertion
 * rather than an accidental omission of a check.
 */
export function canEditCalculatedValue(_ctx: LeadOpsViewerContext): boolean {
  return false
}

// ─── Manager Scorecard — instance-based, on top of the role-class checks ───
//
// Everything above answers "what can this ROLE do." The Manager Scorecard
// also needs "is this viewer THE manager being scored" — a single named
// individual (Alex), not a role class — so these take managerId as a
// parameter rather than importing a specific manager from mockData.ts,
// keeping this module's existing "pure predicates over plain inputs" shape
// and letting call sites pass whichever manager's scorecard is on screen.

/** The manager viewing their own scorecard, or anyone management-tier — reading only, unless they're also the manager or the HOD (see canEnterManagerSelfRating/canReviewManagerScorecard). */
export function canViewManagerScorecard(ctx: LeadOpsViewerContext, managerId: string): boolean {
  return ctx.profileId === managerId || isManagementTier(ctx)
}

/**
 * Only the manager themself enters their own self-rating/evidence on a Rated
 * KPA. (There used to be a hardcoded SIT-only allowance for a test account
 * here; removed before PROD. To demo "as the manager" on SIT, point
 * LEADOPS_MANAGER_EMAIL at a test account instead.)
 */
export function canEnterManagerSelfRating(ctx: LeadOpsViewerContext, managerId: string): boolean {
  return ctx.profileId === managerId
}

/**
 * HOD only — reviewer feedback (rating, comments, agreed action) is an HOD
 * responsibility, not a general Management one. A plain `management`-role
 * viewer who is neither the manager being scored nor the HOD only ever
 * reads this scorecard — self-assessment is Alex's alone, reviewer
 * feedback is the HOD's alone, and anyone else in between sees whatever
 * either of them has already provided, never an edit control.
 */
export function canReviewManagerScorecard(ctx: LeadOpsViewerContext, managerId: string): boolean {
  return isHod(ctx) && ctx.profileId !== managerId
}

/** Team size is a shared operational fact, not the manager's own record — any management-tier viewer (including the manager) can correct it. */
export function canEditTlTeamSize(ctx: LeadOpsViewerContext): boolean {
  return isManagementTier(ctx)
}
