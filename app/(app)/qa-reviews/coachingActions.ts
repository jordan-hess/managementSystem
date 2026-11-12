'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { isQaReviewer } from '@/lib/auth/authz'
import type { Role, CoachingActionStatus } from '@/types'

/**
 * Server actions for the coaching workflow. Suggest, never auto-create: the
 * caller (CoachingActionsPanel) only ever invokes createCoachingActionAction
 * after a person explicitly clicks "Create Coaching Action" — nothing here
 * runs identifyCoachingOpportunities or calls itself automatically.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

class ActionError extends Error {}

async function requireUser(): Promise<{ userId: string; role: Role } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Unauthorized' }
  const [profile] = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  if (!profile) return { error: 'Unauthorized' }
  return { userId, role: profile.role }
}

export interface CreateCoachingActionInput {
  reviewId: string
  category: string
  notes: string | null
  requiredAction: string
  dueDate: string | null
  ownerId: string
}

export async function createCoachingActionAction(input: CreateCoachingActionInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (!isQaReviewer(auth.role)) return { error: 'Forbidden' }
  if (!input.category.trim()) return { error: 'Category is required.' }
  if (!input.requiredAction.trim()) return { error: 'Required action is required.' }
  if (!input.ownerId) return { error: 'Owner is required.' }

  const ownerRows = await sql<{ id: string }[]>`
    SELECT id FROM profiles
    WHERE id = ${input.ownerId} AND role IN ('qa_analyst', 'team_leader', 'admin', 'management', 'hod') AND is_active = true
  `
  if (ownerRows.length === 0) return { error: 'Invalid owner.' }

  try {
    // agent_id is never trusted from the client — it's resolved from the
    // review itself, so a coaching action can never be attached to the
    // wrong agent regardless of what the form sent.
    const reviewRows = await sql<{ agent_id: string }[]>`SELECT agent_id FROM qa_reviews WHERE id = ${input.reviewId}`
    const review = reviewRows[0]
    if (!review) return { error: 'Review not found.' }

    const rows = await sql<{ id: string }[]>`
      INSERT INTO coaching_actions (review_id, agent_id, category, notes, required_action, due_date, owner_id, created_by)
      VALUES (${input.reviewId}, ${review.agent_id}, ${input.category}, ${input.notes}, ${input.requiredAction}, ${input.dueDate}, ${input.ownerId}, ${auth.userId})
      RETURNING id
    `
    revalidatePath(`/qa-reviews/${input.reviewId}`)
    return { data: { id: rows[0].id } }
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message }
    console.error('createCoachingActionAction failed', error)
    return { error: 'Failed to create coaching action.' }
  }
}

export interface UpdateCoachingActionInput {
  id: string
  category: string
  notes: string | null
  requiredAction: string
  dueDate: string | null
  ownerId: string
  status: CoachingActionStatus
}

export async function updateCoachingActionAction(input: UpdateCoachingActionInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (!isQaReviewer(auth.role)) return { error: 'Forbidden' }
  if (!input.category.trim()) return { error: 'Category is required.' }
  if (!input.requiredAction.trim()) return { error: 'Required action is required.' }
  if (!input.ownerId) return { error: 'Owner is required.' }

  const ownerRows = await sql<{ id: string }[]>`
    SELECT id FROM profiles
    WHERE id = ${input.ownerId} AND role IN ('qa_analyst', 'team_leader', 'admin', 'management', 'hod') AND is_active = true
  `
  if (ownerRows.length === 0) return { error: 'Invalid owner.' }

  try {
    const existingRows = await sql<{ review_id: string; status: CoachingActionStatus }[]>`
      SELECT review_id, status FROM coaching_actions WHERE id = ${input.id}
    `
    const existing = existingRows[0]
    if (!existing) return { error: 'Coaching action not found.' }

    const movingToCompleted = input.status === 'completed' && existing.status !== 'completed'
    const movingOffCompleted = input.status !== 'completed' && existing.status === 'completed'

    if (movingToCompleted) {
      await sql`
        UPDATE coaching_actions SET
          category = ${input.category}, notes = ${input.notes}, required_action = ${input.requiredAction},
          due_date = ${input.dueDate}, owner_id = ${input.ownerId}, status = ${input.status},
          completed_at = NOW(), completed_by = ${auth.userId}, updated_at = NOW()
        WHERE id = ${input.id}
      `
    } else if (movingOffCompleted) {
      await sql`
        UPDATE coaching_actions SET
          category = ${input.category}, notes = ${input.notes}, required_action = ${input.requiredAction},
          due_date = ${input.dueDate}, owner_id = ${input.ownerId}, status = ${input.status},
          completed_at = NULL, completed_by = NULL, updated_at = NOW()
        WHERE id = ${input.id}
      `
    } else {
      await sql`
        UPDATE coaching_actions SET
          category = ${input.category}, notes = ${input.notes}, required_action = ${input.requiredAction},
          due_date = ${input.dueDate}, owner_id = ${input.ownerId}, status = ${input.status}, updated_at = NOW()
        WHERE id = ${input.id}
      `
    }

    revalidatePath(`/qa-reviews/${existing.review_id}`)
    return { data: { id: input.id } }
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message }
    console.error('updateCoachingActionAction failed', error)
    return { error: 'Failed to update coaching action.' }
  }
}
