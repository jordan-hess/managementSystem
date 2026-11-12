'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

/**
 * Lets an agent leave optional feedback on their own QA review — one
 * free-text field, editable any number of times. Never trusts a
 * client-supplied agent_id: the review's actual agent_id is re-checked
 * server-side against the caller on every call.
 */
export async function submitAgentFeedbackAction(reviewId: string, feedback: string): Promise<ActionResult<true>> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Unauthorized' }

  const rows = await sql<{ agent_id: string }[]>`SELECT agent_id FROM qa_reviews WHERE id = ${reviewId}`
  const review = rows[0]
  if (!review) return { error: 'Review not found.' }
  if (review.agent_id !== userId) return { error: 'You can only leave feedback on your own reviews.' }

  try {
    await sql`UPDATE qa_reviews SET agent_feedback = ${feedback || null}, updated_at = NOW() WHERE id = ${reviewId}`
    revalidatePath('/qa')
    return { data: true }
  } catch (error) {
    console.error('submitAgentFeedbackAction failed', error)
    return { error: 'Could not save feedback.' }
  }
}
