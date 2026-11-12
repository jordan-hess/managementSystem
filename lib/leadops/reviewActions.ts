'use server'

/**
 * leadOps Performance Reviews — real data. Separate from the other leadOps action modules on purpose: a problem with
 * these tables must never take down KPI Actuals, Daily/Weekly, Time & Motion or the Manager Scorecard.
 * See docs/superpowers/specs/2026-10-10-leadops-performance-reviews-design.md.
 *
 * Every action starts with requireLeadOps() and authorises on its own: a Server Action is a public POST endpoint, so
 * hiding a control is never the authorisation. Nothing the client sends is trusted for identity, for the figures, or
 * for which version of a review is current. A team leader is only ever sent the FROZEN share — never draft text, never
 * another team leader's review, never a past copy.
 */

import { randomUUID } from 'node:crypto'
import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { isHod, isManagementTier, isTeamLeader } from './permissions'
import { todayInSouthAfrica } from './periods'
import { loadReviewFigures } from './reviewFigures'
import { REVIEW_MESSAGES as M, reviewNotice, reviewPeriodProblem, validateComment, validateReason, validateReviewText, type ReviewStatus } from './reviewLimits'
import { buildReviewSnapshot, diffSnapshots, type FigureChange, type ReviewSnapshot } from './reviewSnapshot'
import { requireLeadOps } from './serverGuard'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

// ─── What the client receives ─────────────────────────────────────────────

export interface ReviewRecord {
  id: string
  tlId: string | null
  tlName: string
  period: string
  status: ReviewStatus
  notes: string | null
  agreedActions: string | null
  revision: number
  createdByName: string
  lastEditedByName: string
  sharedByName: string | null
  currentShareEventId: string | null
  tlViewedEventId: string | null
  updatedAt: string
}

/** What a team leader may see of an event: the status change, who, when, and their own comment. No copies, no reasons. */
export interface ReviewEventPublic {
  id: string
  fromStatus: ReviewStatus | null
  toStatus: ReviewStatus
  actorName: string
  at: string
  note: string | null
}

/** Reviewers (management/HOD) additionally see the reason and the frozen copies each share stored. */
export interface ReviewEventFull extends ReviewEventPublic {
  reason: string | null
  notesCopy: string | null
  actionsCopy: string | null
  snapshot: ReviewSnapshot | null
  snapshotVersion: number | null
}

export type TeamLeaderReviewView = {
  kind: 'team_leader'
  state: 'none' | 'being_revised' | 'shared' | 'acknowledged'
  reviewId: string | null
  shared: { shareEventId: string; notes: string; agreedActions: string; snapshot: ReviewSnapshot; reviewedBy: string; sharedAt: string } | null
  events: ReviewEventPublic[]
}

export type ReviewerReviewView = {
  kind: 'reviewer'
  review: ReviewRecord | null
  live: ReviewSnapshot
  changes: FigureChange[]
  events: ReviewEventFull[]
  seenByTeamLeader: boolean
  previousComment: { note: string; actorName: string; at: string } | null
}

// ─── Row shapes (date columns already come back as strings, see lib/db/pool.ts) ──

interface ReviewRow {
  id: string
  tl_id: string | null
  tl_name: string
  period: string
  status: ReviewStatus
  notes: string | null
  agreed_actions: string | null
  revision: number
  created_by: string | null
  created_by_name: string
  last_edited_by: string | null
  last_edited_by_name: string
  shared_by: string | null
  shared_by_name: string | null
  current_share_event_id: string | null
  tl_viewed_event_id: string | null
  updated_at: string
}

interface EventRow {
  id: string
  review_id: string
  from_status: ReviewStatus | null
  to_status: ReviewStatus
  actor_id: string | null
  actor_name: string
  reason: string | null
  note: string | null
  notes_copy: string | null
  actions_copy: string | null
  snapshot: ReviewSnapshot | null
  snapshot_version: number | null
  created_at: string
}

const toRecord = (r: ReviewRow): ReviewRecord => ({
  id: r.id,
  tlId: r.tl_id,
  tlName: r.tl_name,
  period: r.period,
  status: r.status,
  notes: r.notes,
  agreedActions: r.agreed_actions,
  revision: Number(r.revision),
  createdByName: r.created_by_name,
  lastEditedByName: r.last_edited_by_name,
  sharedByName: r.shared_by_name,
  currentShareEventId: r.current_share_event_id,
  tlViewedEventId: r.tl_viewed_event_id,
  updatedAt: r.updated_at,
})

const toPublic = (e: EventRow): ReviewEventPublic => ({
  id: e.id,
  fromStatus: e.from_status,
  toStatus: e.to_status,
  actorName: e.actor_name,
  at: e.created_at,
  note: e.note,
})

const toFull = (e: EventRow): ReviewEventFull => ({
  ...toPublic(e),
  reason: e.reason,
  notesCopy: e.notes_copy,
  actionsCopy: e.actions_copy,
  snapshot: e.snapshot,
  snapshotVersion: e.snapshot_version === null ? null : Number(e.snapshot_version),
})

/** A Postgres "invalid input syntax" error (e.g. a forged, non-uuid id) is a bad request, not an outage. */
const isInvalidInput = (error: unknown): boolean => (error as { code?: string } | null)?.code === '22P02'

// ─── Fetch ────────────────────────────────────────────────────────────────

/**
 * One team leader's review for a month. A team leader reads only their own, and only its frozen share. Management and
 * HOD read any REAL team leader's (a team_leaders row) — or a former team leader who still has a review that month
 * (offboarding removes the team_leaders row but keeps the reviews, and the roster lists them): the full review, the live
 * figures, what changed since the share, and the events with their copies.
 */
export async function fetchLeadOpsReviewAction(tlId: string, period: string): Promise<ActionResult<TeamLeaderReviewView | ReviewerReviewView>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  const reviewer = isManagementTier(viewer)
  if (!reviewer && !(isTeamLeader(viewer) && tlId === userId)) return { error: M.forbidden }

  const problem = reviewPeriodProblem(period, todayInSouthAfrica(new Date()))
  if (problem) return { error: problem }
  if (typeof tlId !== 'string' || tlId === '') return { error: M.invalidTeamLeader }

  try {
    const leader = await sql<{ id: string; full_name: string }[]>`
      SELECT p.id, p.full_name FROM team_leaders tl JOIN profiles p ON p.id = tl.profile_id WHERE tl.profile_id = ${tlId} LIMIT 1
    `
    if (leader.length === 0 && !reviewer) return { error: M.invalidTeamLeader }

    const [reviewRows, eventRows] = await Promise.all([
      sql<ReviewRow[]>`SELECT * FROM performance_reviews WHERE tl_id = ${tlId} AND period = ${period}`,
      sql<EventRow[]>`
        SELECT e.* FROM review_events e JOIN performance_reviews r ON r.id = e.review_id
        WHERE r.tl_id = ${tlId} AND r.period = ${period} ORDER BY e.created_at, e.id
      `,
    ])
    const review = reviewRows[0] as ReviewRow | undefined
    // A former team leader (no team_leaders row) is readable by a reviewer only through a review they already have.
    if (leader.length === 0 && !review) return { error: M.invalidTeamLeader }

    if (!reviewer) return { data: teamLeaderView(review, eventRows) }

    const figures = await loadReviewFigures(tlId, period)
    const live = buildReviewSnapshot({
      period, teamLeaderName: leader.length > 0 ? leader[0].full_name : review!.tl_name, sharedByName: null, takenAt: new Date().toISOString(),
      scores: figures.scores, weekly: figures.weekly,
    })
    const shareEvent = review?.current_share_event_id ? eventRows.find((e) => e.id === review.current_share_event_id) : undefined
    const frozenIsCurrent = review !== undefined && review.status !== 'draft' && shareEvent?.snapshot
    const lastAck = [...eventRows].reverse().find((e) => e.to_status === 'acknowledged' && e.note)

    return {
      data: {
        kind: 'reviewer',
        review: review ? toRecord(review) : null,
        live,
        changes: frozenIsCurrent && shareEvent?.snapshot ? diffSnapshots(shareEvent.snapshot, live) : [],
        events: eventRows.map(toFull),
        seenByTeamLeader:
          review !== undefined && review.status !== 'draft' && review.current_share_event_id !== null && review.tl_viewed_event_id === review.current_share_event_id,
        previousComment: lastAck && lastAck.note ? { note: lastAck.note, actorName: lastAck.actor_name, at: lastAck.created_at } : null,
      },
    }
  } catch (error) {
    if (isInvalidInput(error)) return { error: M.invalidTeamLeader }
    console.error('fetchLeadOpsReviewAction failed', error)
    return { error: M.loadFailed }
  }
}

/** The frozen share only — and nothing at all that reveals a draft that was never shared. */
function teamLeaderView(review: ReviewRow | undefined, eventRows: EventRow[]): TeamLeaderReviewView {
  if (!review || (review.status === 'draft' && review.current_share_event_id === null)) {
    return { kind: 'team_leader', state: 'none', reviewId: null, shared: null, events: [] }
  }
  // The creation event (null -> draft) would reveal a draft; every later status change is part of the shared story.
  const events = eventRows.filter((e) => e.from_status !== null).map(toPublic)
  if (review.status === 'draft') {
    return { kind: 'team_leader', state: 'being_revised', reviewId: review.id, shared: null, events }
  }
  const share = eventRows.find((e) => e.id === review.current_share_event_id)
  if (!share || share.snapshot === null || share.notes_copy === null || share.actions_copy === null) {
    return { kind: 'team_leader', state: 'none', reviewId: null, shared: null, events: [] }
  }
  return {
    kind: 'team_leader',
    state: review.status,
    reviewId: review.id,
    shared: {
      shareEventId: share.id,
      notes: share.notes_copy,
      agreedActions: share.actions_copy,
      snapshot: share.snapshot,
      reviewedBy: share.actor_name,
      sharedAt: share.created_at,
    },
    events,
  }
}

// ─── Shared helpers for the writes ────────────────────────────────────────

async function personName(id: string): Promise<string | null> {
  const rows = await sql<{ full_name: string }[]>`SELECT full_name FROM profiles WHERE id = ${id}`
  return rows.length > 0 ? rows[0].full_name : null
}

async function realTeamLeader(tlId: string): Promise<{ id: string; full_name: string } | null> {
  const rows = await sql<{ id: string; full_name: string }[]>`
    SELECT p.id, p.full_name FROM team_leaders tl JOIN profiles p ON p.id = tl.profile_id WHERE tl.profile_id = ${tlId} LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

const textOrNull = (v: string | null | undefined): string | null => (typeof v === 'string' && v !== '' ? v : null)

// ─── Save the draft ───────────────────────────────────────────────────────

export interface SaveReviewDraftRequest {
  tlId: string
  period: string
  /** The revision the screen last loaded or saved; 0 for a review that does not exist yet. */
  expectedRevision: number
  notes: string | null
  agreedActions: string | null
  /** The reviewer's explicit confirmation that editing a SHARED review unshares it. The server enforces the rule; the screen only warns. */
  confirmUnshare: boolean
}

/**
 * Management and HOD write the notes and agreed actions. Creates the review on the first save. Revision-guarded exactly
 * like a Time & Motion day: the check and the bump are one statement in the transaction; a stale save is a conflict and
 * writes nothing. Editing a shared review unshares it (shared -> draft, logged, and the team leader is told if they had
 * opened that version); an acknowledged review is locked (only the HOD reopens it).
 */
export async function saveReviewDraftAction(req: SaveReviewDraftRequest): Promise<ActionResult<{ revision: number; unshared: boolean }>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  if (!isManagementTier(viewer)) return { error: M.forbidden }

  const { tlId, period, expectedRevision, notes, agreedActions, confirmUnshare } = req ?? ({} as SaveReviewDraftRequest)
  const periodProblem = reviewPeriodProblem(period, todayInSouthAfrica(new Date()))
  if (periodProblem) return { error: periodProblem }
  if (typeof tlId !== 'string' || tlId === '') return { error: M.invalidTeamLeader }
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return { error: M.invalidRevision }
  const textProblem = validateReviewText({ notes, agreedActions })
  if (textProblem) return { error: textProblem }

  try {
    const leader = await realTeamLeader(tlId)
    if (!leader) return { error: M.invalidTeamLeader }
    const actor = await personName(userId)
    if (!actor) return { error: M.forbidden }

    const existing = await sql<ReviewRow[]>`SELECT * FROM performance_reviews WHERE tl_id = ${tlId} AND period = ${period}`
    const current = existing[0] as ReviewRow | undefined
    if (expectedRevision === 0) {
      if (current) return { error: M.conflict } // someone created it first
    } else {
      if (!current) return { error: M.conflict }
      if (current.status === 'acknowledged') return { error: M.acknowledgedLocked }
      if (current.status === 'shared' && confirmUnshare !== true) return { error: M.confirmUnshare }
    }

    const outcome = await withTransaction(async (tx) => {
      if (expectedRevision === 0) {
        // First save: the unique key lets exactly one of two simultaneous first saves insert the row.
        const rows = await tx<{ id: string; revision: number }[]>`
          INSERT INTO performance_reviews (tl_id, tl_name, period, status, notes, agreed_actions, revision, created_by, created_by_name, last_edited_by, last_edited_by_name)
          VALUES (${tlId}, ${leader.full_name}, ${period}, 'draft', ${textOrNull(notes)}, ${textOrNull(agreedActions)}, 1, ${userId}, ${actor}, ${userId}, ${actor})
          ON CONFLICT (tl_id, period) DO NOTHING RETURNING id, revision
        `
        if (rows.length === 0) return 'conflict' as const
        await tx`
          INSERT INTO review_events (review_id, from_status, to_status, actor_id, actor_name)
          VALUES (${rows[0].id}, NULL, 'draft', ${userId}, ${actor})
        `
        return { revision: 1, unshared: false }
      }

      const wasShared = current!.status === 'shared'
      // Check and bump in one statement (its row lock is held until commit); also pins the status we validated against.
      // RETURNING reads the row this statement locked, so "had the team leader opened this version" is not a stale pre-read
      // (markReviewViewed commits without bumping the revision).
      const rows = await tx<{ revision: number; tl_had_viewed: boolean }[]>`
        UPDATE performance_reviews
        SET notes = ${textOrNull(notes)}, agreed_actions = ${textOrNull(agreedActions)}, status = 'draft', revision = revision + 1,
            last_edited_by = ${userId}, last_edited_by_name = ${actor}, updated_at = now()
        WHERE id = ${current!.id} AND revision = ${expectedRevision} AND status = ${current!.status}
        RETURNING revision, (tl_viewed_event_id IS NOT NULL AND tl_viewed_event_id = current_share_event_id) AS tl_had_viewed
      `
      if (rows.length === 0) return 'conflict' as const

      if (wasShared) {
        await tx`
          INSERT INTO review_events (review_id, from_status, to_status, actor_id, actor_name)
          VALUES (${current!.id}, 'shared', 'draft', ${userId}, ${actor})
        `
        // Tell the team leader only if they had opened the version that is now being revised.
        if (rows[0].tl_had_viewed === true) {
          const notice = reviewNotice('being_revised', period)
          await tx`
            INSERT INTO notifications (recipient_id, sender_id, title, message, type)
            VALUES (${tlId}, ${userId}, ${notice.title}, ${notice.message}, 'info')
          `
        }
      }
      return { revision: Number(rows[0].revision), unshared: wasShared }
    })

    if (outcome === 'conflict') return { error: M.conflict }
    return { data: outcome }
  } catch (error) {
    if (isInvalidInput(error)) return { error: M.invalidTeamLeader }
    console.error('saveReviewDraftAction failed', error)
    return { error: M.saveFailed }
  }
}

// ─── Share ────────────────────────────────────────────────────────────────

export interface ShareReviewRequest {
  tlId: string
  period: string
  expectedRevision: number
}

/**
 * draft -> shared. The figures snapshot is computed HERE, on the server, from the real tables (never from the browser)
 * and stored, with the notes and agreed actions exactly as they are in the row being locked, in the share event. The
 * review's `current_share_event_id` points at it; the team leader is notified in the same transaction.
 */
export async function shareReviewAction(req: ShareReviewRequest): Promise<ActionResult<{ revision: number; shareEventId: string }>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  if (!isManagementTier(viewer)) return { error: M.forbidden }

  const { tlId, period, expectedRevision } = req ?? ({} as ShareReviewRequest)
  const periodProblem = reviewPeriodProblem(period, todayInSouthAfrica(new Date()))
  if (periodProblem) return { error: periodProblem }
  if (typeof tlId !== 'string' || tlId === '') return { error: M.invalidTeamLeader }
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) return { error: M.invalidRevision }

  try {
    const leader = await realTeamLeader(tlId)
    if (!leader) return { error: M.invalidTeamLeader }
    const actor = await personName(userId)
    if (!actor) return { error: M.forbidden }

    const rows = await sql<ReviewRow[]>`SELECT * FROM performance_reviews WHERE tl_id = ${tlId} AND period = ${period}`
    const current = rows[0] as ReviewRow | undefined
    if (!current) return { error: M.notFound }
    if (current.status !== 'draft') return { error: M.illegalTransition }

    const figures = await loadReviewFigures(tlId, period)
    const snapshot = buildReviewSnapshot({
      period, teamLeaderName: leader.full_name, sharedByName: actor, takenAt: new Date().toISOString(),
      scores: figures.scores, weekly: figures.weekly,
    })
    const eventId = randomUUID()

    const outcome = await withTransaction(async (tx) => {
      // Update first (revision-guarded, status pinned); the keys between the review and its events are deferred to commit.
      const updated = await tx<{ revision: number; notes: string | null; agreed_actions: string | null }[]>`
        UPDATE performance_reviews
        SET status = 'shared', shared_by = ${userId}, shared_by_name = ${actor}, current_share_event_id = ${eventId},
            revision = revision + 1, updated_at = now()
        WHERE id = ${current.id} AND revision = ${expectedRevision} AND status = 'draft'
        RETURNING revision, notes, agreed_actions
      `
      if (updated.length === 0) return 'conflict' as const
      // The snapshot goes in as an OBJECT via tx.json(): postgres.js JSON-encodes jsonb parameters itself, so a
      // JSON.stringify()'d string would be encoded twice and stored as a jsonb string (unreadable as a snapshot).
      await tx`
        INSERT INTO review_events (id, review_id, from_status, to_status, actor_id, actor_name, notes_copy, actions_copy, snapshot, snapshot_version)
        VALUES (${eventId}, ${current.id}, 'draft', 'shared', ${userId}, ${actor}, ${updated[0].notes ?? ''}, ${updated[0].agreed_actions ?? ''},
                ${tx.json(snapshot as unknown as Parameters<typeof tx.json>[0])}, ${snapshot.version})
      `
      const notice = reviewNotice('shared', period)
      await tx`
        INSERT INTO notifications (recipient_id, sender_id, title, message, type)
        VALUES (${tlId}, ${userId}, ${notice.title}, ${notice.message}, 'info')
      `
      return { revision: Number(updated[0].revision), shareEventId: eventId }
    })

    if (outcome === 'conflict') return { error: M.conflict }
    return { data: outcome }
  } catch (error) {
    if (isInvalidInput(error)) return { error: M.invalidTeamLeader }
    console.error('shareReviewAction failed', error)
    return { error: M.saveFailed }
  }
}

// ─── Acknowledge ──────────────────────────────────────────────────────────

export interface AcknowledgeReviewRequest {
  reviewId: string
  /** The share event the team leader was SHOWN. Refused unless it is still the review's current share. */
  shareEventId: string
  note: string | null
}

/**
 * shared -> acknowledged, by the team leader the review belongs to and nobody else. "Acknowledged" means "I have read
 * this", not "I agree". The request carries the share event the team leader was shown; if the reviewer has since
 * edited and re-shared, that is no longer the current share and the click is refused — a team leader can never
 * acknowledge text they have not read. The optional comment is stored on the event (its own column), capped at 1000
 * characters, and is permanent. The sharer is notified in the same transaction.
 */
export async function acknowledgeReviewAction(req: AcknowledgeReviewRequest): Promise<ActionResult<{ revision: number }>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  if (!viewer.hasTeamRow) return { error: M.forbidden }

  const { reviewId, shareEventId, note } = req ?? ({} as AcknowledgeReviewRequest)
  if (typeof reviewId !== 'string' || reviewId === '' || typeof shareEventId !== 'string' || shareEventId === '') return { error: M.notFound }
  const commentProblem = validateComment(note)
  if (commentProblem) return { error: commentProblem }

  try {
    const rows = await sql<ReviewRow[]>`SELECT * FROM performance_reviews WHERE id = ${reviewId}`
    const current = rows[0] as ReviewRow | undefined
    // A review that is someone else's is indistinguishable from one that does not exist.
    if (!current || current.tl_id !== userId) return { error: M.forbidden }
    if (current.status === 'draft') return { error: M.notShared }
    if (current.status === 'acknowledged') return { error: M.illegalTransition }
    if (current.current_share_event_id !== shareEventId) return { error: M.staleShare }
    const actor = await personName(userId)
    if (!actor) return { error: M.forbidden }
    const comment = typeof note === 'string' && note.trim() !== '' ? note.trim() : null

    const outcome = await withTransaction(async (tx) => {
      const updated = await tx<{ revision: number }[]>`
        UPDATE performance_reviews SET status = 'acknowledged', revision = revision + 1, updated_at = now()
        WHERE id = ${reviewId} AND status = 'shared' AND current_share_event_id = ${shareEventId} RETURNING revision
      `
      if (updated.length === 0) return 'stale' as const
      await tx`
        INSERT INTO review_events (review_id, from_status, to_status, actor_id, actor_name, note)
        VALUES (${reviewId}, 'shared', 'acknowledged', ${userId}, ${actor}, ${comment})
      `
      if (current.shared_by !== null && current.shared_by !== userId) {
        const notice = reviewNotice('acknowledged', current.period, actor)
        await tx`
          INSERT INTO notifications (recipient_id, sender_id, title, message, type)
          VALUES (${current.shared_by}, ${userId}, ${notice.title}, ${notice.message}, 'info')
        `
      }
      return { revision: Number(updated[0].revision) }
    })

    if (outcome === 'stale') return { error: M.staleShare }
    return { data: outcome }
  } catch (error) {
    if (isInvalidInput(error)) return { error: M.notFound }
    console.error('acknowledgeReviewAction failed', error)
    return { error: M.saveFailed }
  }
}

// ─── Mark viewed ──────────────────────────────────────────────────────────

export interface MarkReviewViewedRequest {
  reviewId: string
  shareEventId: string
}

/**
 * Records which share the team leader last OPENED (so an unshare can tell whether they had read it). Called only by
 * the team leader's own screen — a reviewer's preview never calls it, so a preview never marks a review as seen.
 * With acknowledging, it is the only write a team leader has. It sets one column: no revision bump, no event, so it
 * never conflicts with a reviewer's open edit.
 */
export async function markReviewViewedAction(req: MarkReviewViewedRequest): Promise<ActionResult<{ marked: boolean }>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  if (!viewer.hasTeamRow) return { error: M.forbidden }

  const { reviewId, shareEventId } = req ?? ({} as MarkReviewViewedRequest)
  if (typeof reviewId !== 'string' || reviewId === '' || typeof shareEventId !== 'string' || shareEventId === '') return { error: M.notFound }

  try {
    const rows = await sql<{ id: string }[]>`
      UPDATE performance_reviews SET tl_viewed_event_id = ${shareEventId}
      WHERE id = ${reviewId} AND tl_id = ${userId} AND current_share_event_id = ${shareEventId} AND status IN ('shared', 'acknowledged')
      RETURNING id
    `
    return { data: { marked: rows.length > 0 } }
  } catch (error) {
    if (isInvalidInput(error)) return { error: M.notFound }
    console.error('markReviewViewedAction failed', error)
    return { error: M.saveFailed }
  }
}

// ─── Reopen ───────────────────────────────────────────────────────────────

export interface ReopenReviewRequest {
  reviewId: string
  reason: string
}

/**
 * acknowledged -> draft, HOD only, with a required reason: a second person's sign-off before an agreed record changes.
 * The old acknowledgement and its comment stay in the history (the events are append-only); the review's current
 * share pointer is kept so the history reads correctly. The team leader and the sharer are notified in the same
 * transaction.
 */
export async function reopenReviewAction(req: ReopenReviewRequest): Promise<ActionResult<{ revision: number }>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  if (!isHod(viewer)) return { error: M.hodOnly }

  const { reviewId, reason } = req ?? ({} as ReopenReviewRequest)
  if (typeof reviewId !== 'string' || reviewId === '') return { error: M.notFound }
  const reasonProblem = validateReason(reason)
  if (reasonProblem) return { error: reasonProblem }

  try {
    const rows = await sql<ReviewRow[]>`SELECT * FROM performance_reviews WHERE id = ${reviewId}`
    const current = rows[0] as ReviewRow | undefined
    if (!current) return { error: M.notFound }
    if (current.status !== 'acknowledged') return { error: M.illegalTransition }
    const actor = await personName(userId)
    if (!actor) return { error: M.forbidden }

    const outcome = await withTransaction(async (tx) => {
      const updated = await tx<{ revision: number }[]>`
        UPDATE performance_reviews SET status = 'draft', revision = revision + 1, updated_at = now()
        WHERE id = ${reviewId} AND status = 'acknowledged' RETURNING revision
      `
      if (updated.length === 0) return 'illegal' as const
      await tx`
        INSERT INTO review_events (review_id, from_status, to_status, actor_id, actor_name, reason)
        VALUES (${reviewId}, 'acknowledged', 'draft', ${userId}, ${actor}, ${reason.trim()})
      `
      // tl_id is NULL once the team leader's account is deleted - nobody to notify.
      if (current.tl_id !== null) {
        const toTl = reviewNotice('reopened_tl', current.period)
        await tx`
          INSERT INTO notifications (recipient_id, sender_id, title, message, type)
          VALUES (${current.tl_id}, ${userId}, ${toTl.title}, ${toTl.message}, 'info')
        `
      }
      if (current.shared_by !== null && current.shared_by !== userId) {
        const toSharer = reviewNotice('reopened_reviewer', current.period, current.tl_name)
        await tx`
          INSERT INTO notifications (recipient_id, sender_id, title, message, type)
          VALUES (${current.shared_by}, ${userId}, ${toSharer.title}, ${toSharer.message}, 'info')
        `
      }
      return { revision: Number(updated[0].revision) }
    })

    if (outcome === 'illegal') return { error: M.illegalTransition }
    return { data: outcome }
  } catch (error) {
    if (isInvalidInput(error)) return { error: M.notFound }
    console.error('reopenReviewAction failed', error)
    return { error: M.saveFailed }
  }
}

// ─── The picker's people ──────────────────────────────────────────────────

export interface ReviewRosterEntry {
  id: string
  name: string
  /** This month's review status, or null when no review exists yet. */
  status: ReviewStatus | null
}

/**
 * Management and HOD pick a team leader from this list: every CURRENT team leader plus anyone who already has a review
 * for the month (the roster keeps no history of who was a team leader in a past month, so "active that month" cannot
 * be known). Each carries that month's review status.
 */
export async function fetchReviewRosterAction(period: string): Promise<ActionResult<ReviewRosterEntry[]>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  if (!isManagementTier(guard.viewer)) return { error: M.forbidden }
  const problem = reviewPeriodProblem(period, todayInSouthAfrica(new Date()))
  if (problem) return { error: problem }

  try {
    const rows = await sql<{ id: string; name: string; status: ReviewStatus | null }[]>`
      SELECT p.id, p.full_name AS name, r.status
      FROM profiles p
      LEFT JOIN performance_reviews r ON r.tl_id = p.id AND r.period = ${period}
      WHERE p.id IN (SELECT profile_id FROM team_leaders) OR r.id IS NOT NULL
      ORDER BY p.full_name
    `
    return { data: rows.map((r) => ({ id: r.id, name: r.name, status: r.status })) }
  } catch (error) {
    console.error('fetchReviewRosterAction failed', error)
    return { error: M.loadFailed }
  }
}
