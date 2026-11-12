'use server'

import { revalidatePath } from 'next/cache'
import type { Sql } from 'postgres'
import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { qaReviewCanCreate, qaReviewCanDelete, qaReviewCanEdit } from '@/lib/auth/authz'
import { DEPARTMENTS, type Department } from '@/lib/departments'
import { loadSettingsRows, scoreToReviewColumns, itemUsedEarned } from '@/lib/qa/persist'
import {
  SCORECARD_ITEMS, applyLegs, missingCriticals, resolveSettings, scoreScorecard, toDbLeg,
  type ItemCode, type ItemInput, type LegValue, type QaLegs,
} from '@/lib/qa/scorecard'
import type { Role } from '@/types'

/**
 * Server actions for QA review capture (QA Scorecard). The server re-scores
 * from the raw per-leg answers under a SHARE lock on qa_settings (so a
 * settings change can't land between resolving the settings row and writing
 * the review) and never trusts a client-computed score. Failures return { error }
 * (thrown server-action messages are masked in production).
 */

export interface ReviewItemInput {
  code: ItemCode
  written: LegValue
  call: LegValue
  comments: string | null
  evidence: string | null
}

export interface SaveReviewInput {
  id?: string
  agentId: string
  legs: QaLegs
  department: Department
  interactionDate: string
  reviewDate: string
  categoryId: string | null
  interactionType: string | null
  ticketReference: string | null
  callReference: string | null
  customerReference: string | null
  secondaryAgentName: string | null
  overallComments: string | null
  items: ReviewItemInput[]
  reasonTags: { typeId: string }[]
  coachingFlags: { typeId: string; notes: string }[]
  fcr: 'yes' | 'no' | 'na' | null
  rootCauseTypeId: string | null
  gapIdentified: string | null
  solution: string | null
}

type FailureType = { id: string; name: string; item_code: ItemCode | null; requires_coaching: boolean }
type PreviousFailure = { critical_failure_type_id: string; notes: string | null; name: string }
type PreviousItem = { item_code: ItemCode; written_value: string | null; call_value: string | null; comments: string | null; evidence: string | null }

class ActionError extends Error {}

async function requireUser(): Promise<{ userId: string; role: Role }> {
  const userId = await getCurrentUserId()
  if (!userId) throw new ActionError('Unauthorized')
  const [profile] = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  if (!profile) throw new ActionError('Unauthorized')
  return { userId, role: profile.role }
}

const LEGS: QaLegs[] = ['written', 'call', 'both']
const FCR_VALUES = ['yes', 'no', 'na']
const norm = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const blankToNull = (v: string | null | undefined): string | null => (v && v.trim() ? v : null)

function isLegalValue(code: ItemCode, v: LegValue): boolean {
  if (v === null || v === 'na') return true
  if (code.startsWith('Q')) return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5
  return v === 'yes' || v === 'no'
}

/** Rejects unknown/duplicate codes and values illegal for the section; missing codes become unanswered. */
function normaliseItems(items: ReviewItemInput[]): ReviewItemInput[] {
  const known = new Set<string>(SCORECARD_ITEMS.map((d) => d.code))
  const seen = new Map<ItemCode, ReviewItemInput>()
  for (const i of items) {
    if (!known.has(i.code)) throw new ActionError(`Unknown item code: ${i.code}`)
    if (seen.has(i.code)) throw new ActionError(`Duplicate item: ${i.code}`)
    if (!isLegalValue(i.code, i.written) || !isLegalValue(i.code, i.call)) {
      throw new ActionError(`Invalid value for item ${i.code}`)
    }
    seen.set(i.code, i)
  }
  return SCORECARD_ITEMS.map((d) => seen.get(d.code) ?? { code: d.code, written: null, call: null, comments: null, evidence: null })
}

async function saveReview(input: SaveReviewInput, mode: 'create' | 'update'): Promise<string> {
  const { userId, role } = await requireUser()
  if (mode === 'create' && !qaReviewCanCreate(role)) throw new ActionError('Forbidden')
  if (mode === 'update' && !input.id) throw new ActionError('Missing review id.')

  if (!LEGS.includes(input.legs)) throw new ActionError('Invalid legs.')
  if (!(DEPARTMENTS as readonly string[]).includes(input.department)) throw new ActionError('Invalid department.')
  if (input.fcr !== null && !FCR_VALUES.includes(input.fcr)) throw new ActionError('Invalid FCR value.')

  const reviewId = await withTransaction(async (tx) => {
    // 1. auth (update: needs the stored reviewer, so the existing row is loaded first).
    let existing: Record<string, unknown> | undefined
    if (mode === 'update') {
      const rows = await tx<Record<string, unknown>[]>`
        SELECT reviewer_id, legs, department, interaction_date, review_date, category_id, interaction_type, ticket_reference,
               customer_reference, call_reference, secondary_agent_name, overall_comments, fcr,
               root_cause_type_id, gap_identified, solution
        FROM qa_reviews WHERE id = ${input.id!}
      `
      existing = rows[0]
      if (!existing) throw new ActionError('Review not found.')
      if (!qaReviewCanEdit(userId, role, existing.reviewer_id as string)) throw new ActionError('Forbidden')
    }

    // 2-3. Lock settings, then read them: a settings change can't slip in before this review commits.
    await tx`LOCK TABLE qa_settings IN SHARE MODE`
    const settings = resolveSettings(await loadSettingsRows(tx as unknown as Sql), input.interactionDate)
    if (!settings) throw new ActionError('No QA settings apply to this interaction date.')

    // 4-5. Force unused legs to N/A, then validate.
    const answered = normaliseItems(input.items)
    const scoringInputs: ItemInput[] = applyLegs(
      answered.map((i) => ({ code: i.code, written: i.written, call: i.call })),
      input.legs
    )
    if (missingCriticals(scoringInputs, input.legs).length > 0) {
      throw new ActionError('Critical items must be answered on every leg that happened')
    }
    if (input.coachingFlags.some((f) => !f.notes?.trim())) throw new ActionError('A root cause requires notes.')

    const typeIds = [...new Set([
      ...input.reasonTags.map((t) => t.typeId),
      ...input.coachingFlags.map((f) => f.typeId),
      ...(input.rootCauseTypeId ? [input.rootCauseTypeId] : []),
    ])]
    const types = typeIds.length
      ? await tx<FailureType[]>`SELECT id, name, item_code, requires_coaching FROM qa_critical_failure_types WHERE id = ANY(${typeIds})`
      : []
    if (types.length !== typeIds.length) throw new ActionError('One or more critical failure types were not found.')
    const typeById = new Map(types.map((t) => [t.id, t]))

    for (const tag of input.reasonTags) {
      const t = typeById.get(tag.typeId)!
      if (t.item_code === null) throw new ActionError(`"${t.name}" is not a reason tag type.`)
      const item = scoringInputs.find((i) => i.code === t.item_code)!
      if (item.written !== 'no' && item.call !== 'no') {
        throw new ActionError(`Reason tag "${t.name}" needs a No on ${t.item_code}.`)
      }
    }
    for (const flag of input.coachingFlags) {
      if (typeById.get(flag.typeId)!.item_code !== null) throw new ActionError(`"${typeById.get(flag.typeId)!.name}" is not a root cause type.`)
    }
    // Root Cause may be any critical-failure type (coaching flag or reason tag alike), so it needs no type check here.
    if (input.categoryId) {
      const [category] = await tx<{ department: string; is_active: boolean }[]>`
        SELECT department, is_active FROM qa_query_categories WHERE id = ${input.categoryId}
      `
      if (!category) throw new ActionError('Category not found.')
      if (category.department !== input.department) throw new ActionError('Category does not belong to this department.')
      // An inactive category can stay on a review that already has it, but can't be newly picked.
      if (!category.is_active && existing?.category_id !== input.categoryId) throw new ActionError('That category is no longer in use.')
    }

    // Previous state, for the audit trail (read before anything is overwritten).
    let previousItems: PreviousItem[] = []
    let previousFailures: PreviousFailure[] = []
    if (mode === 'update') {
      previousItems = await tx<PreviousItem[]>`
        SELECT item_code, written_value, call_value, comments, evidence FROM qa_review_items WHERE review_id = ${input.id!}
      `
      previousFailures = await tx<PreviousFailure[]>`
        SELECT rcf.critical_failure_type_id, rcf.notes, t.name
        FROM qa_review_critical_failures rcf
        JOIN qa_critical_failure_types t ON t.id = rcf.critical_failure_type_id
        WHERE rcf.review_id = ${input.id!}
      `
    }

    // 6. Score.
    const result = scoreScorecard(scoringInputs, settings)
    const cols = scoreToReviewColumns(result)

    // 7. qa_reviews
    let id: string
    if (mode === 'create') {
      const rows = await tx<{ id: string }[]>`
        -- team_leader_id: the agent's team leader right now (one team per agent, LIMIT 1 like getReviewableAgents).
        INSERT INTO qa_reviews (
          agent_id, reviewer_id, team_leader_id, legs, department, interaction_date, review_date, category_id, interaction_type,
          ticket_reference, customer_reference, call_reference, secondary_agent_name,
          raw_score, final_score, critical_fail, rating_label, closing_line, settings_id,
          fcr, root_cause_type_id, gap_identified, solution, overall_comments
        ) VALUES (
          ${input.agentId}, ${userId},
          (SELECT tl.profile_id FROM team_members tm JOIN team_leaders tl ON tl.team_id = tm.team_id WHERE tm.profile_id = ${input.agentId} LIMIT 1),
          ${input.legs}, ${input.department}, ${input.interactionDate}, ${input.reviewDate}, ${input.categoryId}, ${input.interactionType},
          ${input.ticketReference}, ${input.customerReference}, ${input.callReference}, ${input.secondaryAgentName},
          ${cols.raw_score}, ${cols.final_score}, ${cols.critical_fail}, ${cols.rating_label}, ${cols.closing_line}, ${settings.id},
          ${input.fcr}, ${input.rootCauseTypeId}, ${input.gapIdentified}, ${input.solution}, ${input.overallComments}
        )
        RETURNING id
      `
      id = rows[0].id
    } else {
      id = input.id!
      await tx`
        UPDATE qa_reviews SET
          legs = ${input.legs}, department = ${input.department},
          interaction_date = ${input.interactionDate}, review_date = ${input.reviewDate},
          category_id = ${input.categoryId}, interaction_type = ${input.interactionType}, ticket_reference = ${input.ticketReference},
          -- Kept as captured at create; only filled in if the agent had no team leader back then.
          team_leader_id = COALESCE(team_leader_id, (
            SELECT tl.profile_id FROM team_members tm JOIN team_leaders tl ON tl.team_id = tm.team_id WHERE tm.profile_id = qa_reviews.agent_id LIMIT 1
          )),
          customer_reference = ${input.customerReference}, call_reference = ${input.callReference},
          secondary_agent_name = ${input.secondaryAgentName}, overall_comments = ${input.overallComments},
          raw_score = ${cols.raw_score}, final_score = ${cols.final_score}, critical_fail = ${cols.critical_fail},
          rating_label = ${cols.rating_label}, closing_line = ${cols.closing_line}, settings_id = ${settings.id},
          fcr = ${input.fcr}, root_cause_type_id = ${input.rootCauseTypeId},
          gap_identified = ${input.gapIdentified}, solution = ${input.solution}, updated_at = NOW()
        WHERE id = ${id}
      `
    }

    // 8. All 11 items (the legs the form didn't use are stored as the forced N/A).
    const finalByCode = new Map(scoringInputs.map((i) => [i.code, i]))
    for (const def of SCORECARD_ITEMS) {
      const leg = finalByCode.get(def.code)!
      const raw = answered.find((a) => a.code === def.code)!
      const { used, earned } = itemUsedEarned(result, def.code)
      await tx`
        INSERT INTO qa_review_items (review_id, item_code, written_value, call_value, points_snapshot, used, earned, comments, evidence)
        VALUES (${id}, ${def.code}, ${toDbLeg(leg.written)}, ${toDbLeg(leg.call)}, ${def.points}, ${used}, ${earned},
                ${blankToNull(raw.comments)}, ${blankToNull(raw.evidence)})
        ON CONFLICT (review_id, item_code) DO UPDATE SET
          written_value = EXCLUDED.written_value, call_value = EXCLUDED.call_value,
          points_snapshot = EXCLUDED.points_snapshot, used = EXCLUDED.used, earned = EXCLUDED.earned,
          comments = EXCLUDED.comments, evidence = EXCLUDED.evidence, updated_at = NOW()
      `
    }

    // 9. Critical-failure rows: reason tags (notes NULL) and coaching flags (with notes).
    const wanted = [
      ...input.reasonTags.map((t) => ({ typeId: t.typeId, notes: null as string | null })),
      ...input.coachingFlags.map((f) => ({ typeId: f.typeId, notes: f.notes as string | null })),
    ]
    const wantedIds = wanted.map((w) => w.typeId)
    if (mode === 'update') {
      // != ALL(empty array) is vacuously true, so this deletes every row when all are cleared.
      await tx`DELETE FROM qa_review_critical_failures WHERE review_id = ${id} AND critical_failure_type_id != ALL(${wantedIds})`
    }
    for (const w of wanted) {
      const t = typeById.get(w.typeId)!
      await tx`
        INSERT INTO qa_review_critical_failures (review_id, critical_failure_type_id, notes, requires_coaching_snapshot, created_by)
        VALUES (${id}, ${t.id}, ${w.notes}, ${t.requires_coaching}, ${userId})
        ON CONFLICT (review_id, critical_failure_type_id) DO UPDATE SET notes = EXCLUDED.notes
      `
    }

    // 10. Audit (update only).
    if (mode === 'update' && existing) {
      const audit = (action: string, field: string | null, oldValue: string | null, newValue: string | null) =>
        tx`INSERT INTO qa_audit_log (review_id, actor_id, action, field, old_value, new_value) VALUES (${id}, ${userId}, ${action}, ${field}, ${oldValue}, ${newValue})`

      const headerFields: [string, unknown, unknown][] = [
        ['legs', existing.legs, input.legs],
        ['department', existing.department, input.department],
        ['interaction_date', existing.interaction_date, input.interactionDate],
        ['review_date', existing.review_date, input.reviewDate],
        ['category_id', existing.category_id, input.categoryId],
        ['interaction_type', existing.interaction_type, input.interactionType],
        ['ticket_reference', existing.ticket_reference, input.ticketReference],
        ['customer_reference', existing.customer_reference, input.customerReference],
        ['call_reference', existing.call_reference, input.callReference],
        ['secondary_agent_name', existing.secondary_agent_name, input.secondaryAgentName],
        ['overall_comments', existing.overall_comments, input.overallComments],
        ['fcr', existing.fcr, input.fcr],
        ['root_cause_type_id', existing.root_cause_type_id, input.rootCauseTypeId],
        ['gap_identified', existing.gap_identified, input.gapIdentified],
        ['solution', existing.solution, input.solution],
      ]
      for (const [field, oldValue, newValue] of headerFields) {
        if (norm(oldValue) !== norm(newValue)) await audit('header_field_change', field, norm(oldValue), norm(newValue))
      }

      for (const def of SCORECARD_ITEMS) {
        const prev = previousItems.find((p) => p.item_code === def.code)
        if (!prev) continue
        const leg = finalByCode.get(def.code)!
        const raw = answered.find((a) => a.code === def.code)!
        if (prev.written_value !== toDbLeg(leg.written)) await audit('score_change', `${def.code}:written`, prev.written_value, toDbLeg(leg.written))
        if (prev.call_value !== toDbLeg(leg.call)) await audit('score_change', `${def.code}:call`, prev.call_value, toDbLeg(leg.call))
        if (prev.comments !== blankToNull(raw.comments)) await audit('comment_change', def.code, prev.comments, blankToNull(raw.comments))
        if (prev.evidence !== blankToNull(raw.evidence)) await audit('evidence_change', def.code, prev.evidence, blankToNull(raw.evidence))
      }

      for (const w of wanted) {
        const prev = previousFailures.find((p) => p.critical_failure_type_id === w.typeId)
        const name = typeById.get(w.typeId)!.name
        if (!prev) await audit('critical_failure_added', 'critical_failure', null, name)
        else if (prev.notes !== w.notes) await audit('critical_failure_notes_change', name, prev.notes, w.notes)
      }
      for (const prev of previousFailures) {
        if (!wantedIds.includes(prev.critical_failure_type_id)) await audit('critical_failure_removed', 'critical_failure', prev.name, null)
      }
    }

    return id
  })

  revalidatePath('/qa-reviews')
  if (mode === 'update') revalidatePath(`/qa-reviews/${reviewId}`)
  return reviewId
}

export async function createReviewAction(input: SaveReviewInput): Promise<{ id: string } | { error: string }> {
  try {
    return { id: await saveReview(input, 'create') }
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message }
    console.error('createReviewAction failed', error)
    return { error: 'Failed to save review.' }
  }
}

/** Hard delete — items, critical failures, audit log and coaching actions go with it (ON DELETE CASCADE). */
export async function deleteReviewAction(id: string): Promise<{ error?: string }> {
  try {
    const { userId, role } = await requireUser()
    const [review] = await sql<{ reviewer_id: string | null }[]>`SELECT reviewer_id FROM qa_reviews WHERE id = ${id}`
    if (!review) throw new ActionError('Review not found.')
    if (!qaReviewCanDelete(userId, role, review.reviewer_id)) throw new ActionError('Forbidden')
    await sql`DELETE FROM qa_reviews WHERE id = ${id}`
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message }
    console.error('deleteReviewAction failed', error)
    return { error: 'Failed to delete review.' }
  }
  revalidatePath('/qa-reviews')
  return {}
}

export async function updateReviewAction(input: SaveReviewInput & { id: string }): Promise<{ error?: string }> {
  try {
    await saveReview(input, 'update')
    return {}
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message }
    console.error('updateReviewAction failed', error)
    return { error: 'Failed to save review.' }
  }
}
