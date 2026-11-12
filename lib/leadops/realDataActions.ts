'use server'

/**
 * leadOps Manager Scorecard — real data, replacing the mock-only
 * MOCK_EFFICIENCY_SCORES / MOCK_MANAGER_KPA_RATINGS / MOCK_TL_TEAM_SIZES /
 * MOCK_MANAGER_MONTHLY_REVIEW that used to seed LeadOpsDataProvider. See
 * Database/migrations/leadops-manager-scorecard-real-tables-2026-10-01.sql
 * for the schema and docs/manager-scorecard.md for the scope decision (this
 * covers efficiency_scores + the Manager Scorecard's own tables; Daily/
 * Weekly Activity, Time & Motion, the Planner and TL Performance Reviews
 * stay Phase 0 mock data for now).
 *
 * THE ONE DELIBERATE EXCEPTION IN THIS DIRECTORY, alongside
 * rosterShiftAction.ts: every other file under lib/leadops/ is pure and
 * imports nothing from lib/db/pool, so it can be safely imported by
 * 'use client' components. This file is the sanctioned boundary-crossing
 * point for the Manager Scorecard's real tables — a set of Server Actions,
 * called from LeadOpsDataProvider.tsx rather than imported directly by any
 * presentational component.
 *
 * Row shapes mirror lib/leadops/types.ts 1:1 (same snake_case fields), so
 * these actions return data every existing component already knows how to
 * consume — only the SOURCE changed, not the shape. `numeric` columns come
 * back from postgres.js as strings (see lib/db/pool.ts), so self_value/
 * verified_value are explicitly wrapped in Number(); date/timestamp columns
 * are configured to come back as raw strings already, matching every other
 * opsHub row type.
 *
 * AUTHORISATION: every action starts with requireLeadOps() (session, active
 * account, feature flag) and re-checks the caller's role with the
 * permissions.ts predicates. Server Actions are public POST endpoints, so
 * the UI hiding a control is not enough on its own.
 */

import { sql } from '@/lib/db/pool'
import { EFFICIENCY_METRIC_DEFS, MANAGER_KPAS } from './constants'
import { computeManagerKpa, isProvisional, managerRag, overallAndPillars } from './managerScoring'
import {
  canEditTlTeamSize,
  canEnterKpiActual,
  canEnterManagerSelfRating,
  canReviewManagerScorecard,
  canVerifyKpi,
  isManagementTier,
  isTeamLeader,
} from './permissions'
import { requireLeadOps, resolveLeadOpsPeople } from './serverGuard'
import type {
  EfficiencyScore,
  ManagerKpaRating,
  ManagerMonthlyReview,
  ManagerReviewStatus,
  ManagerScorecardSnapshot,
  MockTeamLeader,
  LeadOpsPeople,
  RatingValue,
  RollupWeighting,
  TlTeamSize,
} from './types'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

// ─── Row shapes as they come off the wire (numeric columns still strings) ──

interface EfficiencyScoreRow {
  id: string
  tl_id: string | null
  period: string
  metric_key: string
  self_value: string | null
  is_na: boolean
  na_reason: string | null
  verified_value: string | null
  status: string
  verified_by: string | null
  verified_at: string | null
  verification_note: string | null
  updated_at: string
}

function toEfficiencyScore(row: EfficiencyScoreRow): EfficiencyScore {
  return {
    id: row.id,
    tl_id: row.tl_id,
    period: row.period,
    metric_key: row.metric_key,
    self_value: row.self_value === null ? null : Number(row.self_value),
    is_na: row.is_na,
    na_reason: row.na_reason,
    verified_value: row.verified_value === null ? null : Number(row.verified_value),
    status: row.status as EfficiencyScore['status'],
    verified_by: row.verified_by,
    verified_at: row.verified_at,
    verification_note: row.verification_note,
    updated_at: row.updated_at,
  }
}

interface ManagerKpaRatingRow {
  manager_id: string
  month: string
  kpa_key: string
  self_rating: string | null
  self_evidence: string | null
  reviewer_rating: string | null
  reviewer_comments: string | null
  agreed_action: string | null
  updated_at: string
}

/** '1'|'2'|'3'|'NA' (text column) -> 1|2|3|'NA' (RatingValue). */
function toRatingValue(text: string | null): RatingValue | null {
  if (text === null) return null
  return text === 'NA' ? 'NA' : (Number(text) as 1 | 2 | 3)
}

function toManagerKpaRating(row: ManagerKpaRatingRow): ManagerKpaRating {
  return {
    manager_id: row.manager_id,
    month: row.month,
    kpa_key: row.kpa_key,
    self_rating: toRatingValue(row.self_rating),
    self_evidence: row.self_evidence,
    reviewer_rating: toRatingValue(row.reviewer_rating),
    reviewer_comments: row.reviewer_comments,
    agreed_action: row.agreed_action,
    updated_at: row.updated_at,
  }
}

interface ManagerMonthlyReviewRow {
  id: string
  manager_id: string
  month: string
  reviewer_id: string
  status: string
  locked_snapshot: ManagerScorecardSnapshot | null
  created_at: string
  updated_at: string
}

function toManagerMonthlyReview(row: ManagerMonthlyReviewRow): ManagerMonthlyReview {
  return {
    id: row.id,
    manager_id: row.manager_id,
    month: row.month,
    reviewer_id: row.reviewer_id,
    status: row.status as ManagerReviewStatus,
    locked_snapshot: row.locked_snapshot,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

interface TlTeamSizeRow {
  tl_id: string
  month: string
  agent_count: number
  confirmed: boolean
  updated_at: string
}

function toTlTeamSize(row: TlTeamSizeRow): TlTeamSize {
  return { tl_id: row.tl_id, month: row.month, agent_count: Number(row.agent_count), confirmed: row.confirmed }
}

// ─── Validation helpers ───────────────────────────────────────────────────

const MONTH_RE = /^\d{4}-\d{2}-01$/
const METRIC_DEFS = new Map(EFFICIENCY_METRIC_DEFS.map((d) => [d.key, d]))
const RATED_KPA_KEYS = new Set(MANAGER_KPAS.filter((k) => k.method === 'rated').map((k) => k.key))

const isFiniteOrNull = (n: number | null) => n === null || Number.isFinite(n)
const isValidRating = (r: RatingValue | null) => r === null || r === 1 || r === 2 || r === 3 || r === 'NA'
const ratingToText = (r: RatingValue | null) => (r === null ? null : String(r))

async function tlRowExists(profileId: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM team_leaders WHERE profile_id = ${profileId} LIMIT 1`
  return rows.length > 0
}

async function isMonthLocked(managerId: string, month: string): Promise<boolean> {
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM manager_monthly_reviews WHERE manager_id = ${managerId} AND month = ${month}
  `
  return rows[0]?.status === 'locked'
}

// ─── Fetch — one combined load for LeadOpsDataProvider's initial state ────

export interface LeadOpsRealData {
  scores: EfficiencyScore[]
  managerKpaRatings: ManagerKpaRating[]
  managerReviews: ManagerMonthlyReview[]
  tlTeamSizes: TlTeamSize[]
  /** The real team leaders (one entry per person, teams joined) — management/HOD get all of them, a team leader only themself. */
  teamLeaders: MockTeamLeader[]
  /** Management/HOD only. Null if the manager/reviewer config is missing or doesn't match an active account — see peopleError. */
  people: LeadOpsPeople | null
  peopleError: string | null
}

/**
 * One entry per team leader PROFILE: an admin can lead several teams, so the
 * team names are joined into one label. `onlyProfileId` narrows it to a single
 * person (a team leader loading just their own record).
 */
async function fetchTeamLeaders(onlyProfileId?: string): Promise<MockTeamLeader[]> {
  if (onlyProfileId) {
    return sql<MockTeamLeader[]>`
      SELECT p.id, p.full_name, string_agg(DISTINCT t.name, ', ' ORDER BY t.name) AS team
      FROM team_leaders tl
      JOIN profiles p ON p.id = tl.profile_id
      JOIN teams t ON t.id = tl.team_id
      WHERE p.id = ${onlyProfileId}
      GROUP BY p.id, p.full_name
    `
  }
  return sql<MockTeamLeader[]>`
    SELECT p.id, p.full_name, string_agg(DISTINCT t.name, ', ' ORDER BY t.name) AS team
    FROM team_leaders tl
    JOIN profiles p ON p.id = tl.profile_id
    JOIN teams t ON t.id = tl.team_id
    GROUP BY p.id, p.full_name
    ORDER BY p.full_name
  `
}

/**
 * Scoped by role: management/HOD load everything; a team leader loads only
 * their own KPI actuals (never the manager scorecard tables); everyone else
 * (agents, plain admins) gets nothing.
 */
export async function fetchLeadOpsRealDataAction(): Promise<ActionResult<LeadOpsRealData>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard

  try {
    if (isManagementTier(viewer)) {
      const [scoreRows, ratingRows, reviewRows, sizeRows, teamLeaders, people] = await Promise.all([
        sql<EfficiencyScoreRow[]>`SELECT * FROM efficiency_scores`,
        sql<ManagerKpaRatingRow[]>`SELECT * FROM manager_kpa_ratings`,
        sql<ManagerMonthlyReviewRow[]>`SELECT * FROM manager_monthly_reviews`,
        sql<TlTeamSizeRow[]>`SELECT * FROM tl_team_sizes`,
        fetchTeamLeaders(),
        resolveLeadOpsPeople(),
      ])
      // A missing manager/reviewer config must not block the KPI data — it is
      // reported on its own so only the Manager Scorecard shows the problem.
      const peopleOk = !('error' in people)
      return {
        data: {
          scores: scoreRows.map(toEfficiencyScore),
          managerKpaRatings: ratingRows.map(toManagerKpaRating),
          managerReviews: reviewRows.map(toManagerMonthlyReview),
          tlTeamSizes: sizeRows.map(toTlTeamSize),
          teamLeaders,
          people: peopleOk ? people : null,
          peopleError: peopleOk ? null : people.error,
        },
      }
    }

    if (isTeamLeader(viewer)) {
      const [scoreRows, teamLeaders] = await Promise.all([
        sql<EfficiencyScoreRow[]>`SELECT * FROM efficiency_scores WHERE tl_id = ${userId}`,
        fetchTeamLeaders(userId),
      ])
      return {
        data: {
          scores: scoreRows.map(toEfficiencyScore),
          managerKpaRatings: [],
          managerReviews: [],
          tlTeamSizes: [],
          teamLeaders,
          people: null,
          peopleError: null,
        },
      }
    }

    return { error: 'Forbidden' }
  } catch (error) {
    console.error('fetchLeadOpsRealDataAction failed', error)
    return { error: 'Could not load leadOps data from the database.' }
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────

/**
 * A team leader writes only their own KPI actuals; management/HOD may write any
 * real team leader's. Verification is never taken from the client: only
 * management/HOD can verify, `verified_by` is the signed-in user and
 * `verified_at` is now. Any other write (including a team leader editing an
 * already-verified value) stores the row as self-reported with the
 * verification fields cleared — "editing an actual reverts verification".
 */
export async function upsertEfficiencyScoreAction(score: EfficiencyScore): Promise<ActionResult<EfficiencyScore>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard

  if (!canEnterKpiActual(viewer)) return { error: 'Forbidden' }
  // NULL once the team leader's account is deleted - their scores are kept read-only.
  if (!score.tl_id) return { error: 'That person is not a team leader.' }
  if (score.tl_id !== userId && !isManagementTier(viewer)) return { error: 'Forbidden' }

  const metricDef = METRIC_DEFS.get(score.metric_key)
  if (!metricDef) return { error: 'Unknown KPI.' }
  // The two planner-derived KPIs are computed from Time & Motion data and are
  // locked in the UI — nothing legitimate ever writes them.
  if (metricDef.inputMode === 'derived') return { error: 'This KPI is calculated and cannot be entered.' }
  if (!MONTH_RE.test(score.period)) return { error: 'Invalid period.' }
  if (score.is_na && !score.na_reason?.trim()) return { error: 'A reason is required to mark a KPI as not applicable.' }
  if (!isFiniteOrNull(score.self_value) || !isFiniteOrNull(score.verified_value)) return { error: 'Invalid value.' }

  try {
    const writingOwnRecord = score.tl_id === userId && isTeamLeader(viewer)
    if (!writingOwnRecord && !(await tlRowExists(score.tl_id))) return { error: 'That person is not a team leader.' }

    const verifying = canVerifyKpi(viewer) && (score.status === 'verified' || score.status === 'disputed')
    const status = verifying ? score.status : 'self_reported'
    const verifiedValue = verifying && status === 'verified' ? score.verified_value : null
    const verifiedBy = verifying ? userId : null
    const verifiedAt = verifying ? new Date().toISOString() : null
    const note = verifying ? score.verification_note?.trim() || null : null

    const [row] = await sql<EfficiencyScoreRow[]>`
      INSERT INTO efficiency_scores (tl_id, period, metric_key, self_value, is_na, na_reason, verified_value, status, verified_by, verified_at, verification_note)
      VALUES (${score.tl_id}, ${score.period}, ${score.metric_key}, ${score.self_value}, ${score.is_na}, ${score.na_reason}, ${verifiedValue}, ${status}, ${verifiedBy}, ${verifiedAt}, ${note})
      ON CONFLICT (tl_id, period, metric_key) DO UPDATE SET
        self_value = EXCLUDED.self_value,
        is_na = EXCLUDED.is_na,
        na_reason = EXCLUDED.na_reason,
        verified_value = EXCLUDED.verified_value,
        status = EXCLUDED.status,
        verified_by = EXCLUDED.verified_by,
        verified_at = EXCLUDED.verified_at,
        verification_note = EXCLUDED.verification_note,
        updated_at = now()
      RETURNING *
    `
    return { data: toEfficiencyScore(row) }
  } catch (error) {
    console.error('upsertEfficiencyScoreAction failed', error)
    return { error: 'Could not save this KPI actual.' }
  }
}

/**
 * Self and reviewer columns are written by different people, so which
 * columns this call may change depends on WHO is calling, not on what the
 * client sent: the manager can change only the self rating/evidence, the HOD
 * only the reviewer rating/comments/agreed action. The other half is always
 * kept from the stored row.
 */
export async function upsertManagerKpaRatingAction(rating: ManagerKpaRating): Promise<ActionResult<ManagerKpaRating>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { viewer } = guard

  try {
    const people = await resolveLeadOpsPeople()
    if ('error' in people) return { error: people.error }
    if (rating.manager_id !== people.managerId) return { error: 'Forbidden' }

    const canSelf = canEnterManagerSelfRating(viewer, people.managerId)
    const canReview = canReviewManagerScorecard(viewer, people.managerId)
    if (!canSelf && !canReview) return { error: 'Forbidden' }

    if (!MONTH_RE.test(rating.month)) return { error: 'Invalid month.' }
    if (!RATED_KPA_KEYS.has(rating.kpa_key)) return { error: 'Unknown rated KPA.' }
    if (!isValidRating(rating.self_rating) || !isValidRating(rating.reviewer_rating)) return { error: 'Invalid rating.' }
    if (await isMonthLocked(people.managerId, rating.month)) return { error: 'This month is locked.' }

    const [existing] = await sql<ManagerKpaRatingRow[]>`
      SELECT * FROM manager_kpa_ratings
      WHERE manager_id = ${people.managerId} AND month = ${rating.month} AND kpa_key = ${rating.kpa_key}
    `
    const selfRating = canSelf ? ratingToText(rating.self_rating) : existing?.self_rating ?? null
    const selfEvidence = canSelf ? rating.self_evidence : existing?.self_evidence ?? null
    const reviewerRating = canReview ? ratingToText(rating.reviewer_rating) : existing?.reviewer_rating ?? null
    const reviewerComments = canReview ? rating.reviewer_comments : existing?.reviewer_comments ?? null
    const agreedAction = canReview ? rating.agreed_action : existing?.agreed_action ?? null

    const [row] = await sql<ManagerKpaRatingRow[]>`
      INSERT INTO manager_kpa_ratings (manager_id, month, kpa_key, self_rating, self_evidence, reviewer_rating, reviewer_comments, agreed_action)
      VALUES (${people.managerId}, ${rating.month}, ${rating.kpa_key}, ${selfRating}, ${selfEvidence}, ${reviewerRating}, ${reviewerComments}, ${agreedAction})
      ON CONFLICT (manager_id, month, kpa_key) DO UPDATE SET
        self_rating = EXCLUDED.self_rating,
        self_evidence = EXCLUDED.self_evidence,
        reviewer_rating = EXCLUDED.reviewer_rating,
        reviewer_comments = EXCLUDED.reviewer_comments,
        agreed_action = EXCLUDED.agreed_action,
        updated_at = now()
      RETURNING *
    `
    return { data: toManagerKpaRating(row) }
  } catch (error) {
    console.error('upsertManagerKpaRatingAction failed', error)
    return { error: 'Could not save this rating.' }
  }
}

export async function upsertTlTeamSizeAction(row: TlTeamSize): Promise<ActionResult<TlTeamSize>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  if (!canEditTlTeamSize(guard.viewer)) return { error: 'Forbidden' }

  if (!MONTH_RE.test(row.month)) return { error: 'Invalid month.' }
  if (!Number.isInteger(row.agent_count) || row.agent_count < 0) return { error: 'Invalid team size.' }

  try {
    if (!(await tlRowExists(row.tl_id))) return { error: 'That person is not a team leader.' }
    const people = await resolveLeadOpsPeople()
    if ('error' in people) return { error: people.error }
    if (await isMonthLocked(people.managerId, row.month)) return { error: 'This month is locked.' }

    // Saving a size is what confirms it (an unsaved carry-forward is the only
    // unconfirmed case, and it is never persisted).
    const [result] = await sql<TlTeamSizeRow[]>`
      INSERT INTO tl_team_sizes (tl_id, month, agent_count, confirmed)
      VALUES (${row.tl_id}, ${row.month}, ${row.agent_count}, ${true})
      ON CONFLICT (tl_id, month) DO UPDATE SET
        agent_count = EXCLUDED.agent_count,
        confirmed = EXCLUDED.confirmed,
        updated_at = now()
      RETURNING *
    `
    return { data: toTlTeamSize(result) }
  } catch (error) {
    console.error('upsertTlTeamSizeAction failed', error)
    return { error: 'Could not save this team size.' }
  }
}

// draft -> self_submitted -> reviewed -> locked; locked is terminal. A month
// may also go straight from self_submitted to locked (the UI offers "Lock
// month" at either step).
const ALLOWED_TRANSITIONS: Record<ManagerReviewStatus, ManagerReviewStatus[]> = {
  draft: ['self_submitted'],
  self_submitted: ['reviewed', 'locked'],
  reviewed: ['locked'],
  locked: [],
}

/** Builds the locked snapshot from database rows, with the same pure scoring the Manager Scorecard tab uses to display it. */
async function buildLockedSnapshot(managerId: string, month: string, weighting: RollupWeighting): Promise<ManagerScorecardSnapshot> {
  const [teamLeaders, scoreRows, sizeRows, ratingRows] = await Promise.all([
    fetchTeamLeaders(),
    sql<EfficiencyScoreRow[]>`SELECT * FROM efficiency_scores WHERE period = ${month}`,
    sql<TlTeamSizeRow[]>`SELECT * FROM tl_team_sizes`,
    sql<ManagerKpaRatingRow[]>`SELECT * FROM manager_kpa_ratings WHERE manager_id = ${managerId} AND month = ${month}`,
  ])
  const scores = scoreRows.map(toEfficiencyScore)
  const teamSizes = sizeRows.map(toTlTeamSize)
  const ratings = ratingRows.map(toManagerKpaRating)

  const kpas = MANAGER_KPAS.map((kpa) =>
    computeManagerKpa(kpa, month, {
      teamLeaders,
      teamSizes,
      scores,
      rating: ratings.find((r) => r.kpa_key === kpa.key),
      weighting,
    }),
  )
  const { overallPct, pillars } = overallAndPillars(kpas)
  return { month, managerId, kpas, pillars, overallPct, rag: managerRag(overallPct), provisional: isProvisional(kpas) }
}

/**
 * Moves a manager's month along the review workflow. Only the status is taken
 * from the client — the reviewer is the signed-in HOD, and the locked snapshot
 * is computed here from the database, never accepted from the caller. `weighting`
 * is the roll-up display toggle (not an identity or a score), so the snapshot
 * matches what the HOD was looking at.
 */
export async function upsertManagerMonthlyReviewAction(
  managerId: string,
  month: string,
  status: ManagerReviewStatus,
  weighting: RollupWeighting = 'team_size',
): Promise<ActionResult<ManagerMonthlyReview>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard

  try {
    const people = await resolveLeadOpsPeople()
    if ('error' in people) return { error: people.error }
    if (managerId !== people.managerId) return { error: 'Forbidden' }

    if (!MONTH_RE.test(month)) return { error: 'Invalid month.' }
    if (weighting !== 'team_size' && weighting !== 'equal') return { error: 'Invalid weighting.' }

    const [existing] = await sql<ManagerMonthlyReviewRow[]>`
      SELECT * FROM manager_monthly_reviews WHERE manager_id = ${managerId} AND month = ${month}
    `
    const current: ManagerReviewStatus = (existing?.status as ManagerReviewStatus | undefined) ?? 'draft'
    if (current === 'locked') return { error: 'This month is already locked.' }
    if (!ALLOWED_TRANSITIONS[current].includes(status)) return { error: 'That status change is not allowed.' }

    const allowedActor = status === 'self_submitted'
      ? canEnterManagerSelfRating(viewer, managerId)
      : canReviewManagerScorecard(viewer, managerId)
    if (!allowedActor) return { error: 'Forbidden' }

    const reviewerId = status === 'self_submitted' ? existing?.reviewer_id ?? people.reviewerId : userId
    const snapshot = status === 'locked' ? await buildLockedSnapshot(managerId, month, weighting) : null
    // The snapshot goes in as an OBJECT via sql.json(): postgres.js JSON-encodes jsonb parameters itself, so a
    // JSON.stringify()'d string would be encoded twice and stored as a jsonb string (unreadable as a snapshot).
    // No snapshot stays a plain SQL NULL; sql.json(null) would store the JSON value null instead.
    const snapshotParam = snapshot === null ? null : sql.json(snapshot as unknown as Parameters<typeof sql.json>[0])

    const [row] = await sql<ManagerMonthlyReviewRow[]>`
      INSERT INTO manager_monthly_reviews (manager_id, month, reviewer_id, status, locked_snapshot)
      VALUES (${managerId}, ${month}, ${reviewerId}, ${status}, ${snapshotParam})
      ON CONFLICT (manager_id, month) DO UPDATE SET
        reviewer_id = EXCLUDED.reviewer_id,
        status = EXCLUDED.status,
        locked_snapshot = EXCLUDED.locked_snapshot,
        updated_at = now()
      WHERE manager_monthly_reviews.status <> 'locked'
      RETURNING *
    `
    if (!row) return { error: 'This month is already locked.' }
    return { data: toManagerMonthlyReview(row) }
  } catch (error) {
    console.error('upsertManagerMonthlyReviewAction failed', error)
    return { error: 'Could not save this review.' }
  }
}
