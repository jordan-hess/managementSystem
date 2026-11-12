'use server'

import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { isAdminOrManagement, Role } from '@/lib/auth/authz'
import { ManagementPost, ManagementPostCategory, ManagementPostReaction, AgentKudos } from '@/types'

async function getCurrentUserRole(userId: string): Promise<Role | null> {
  const rows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  return rows[0]?.role ?? null
}

/**
 * management_posts INSERT: author_id = current user AND role IN
 * ('management','admin'). The optional image upload itself still goes
 * through Supabase Storage from the calling component (out of scope for
 * this Postgres migration — see ManagementPostBoard.tsx) — this action only
 * covers the row insert once an image_url (or null) has already been
 * resolved.
 */
export async function createManagementPost(input: {
  title: string
  category: ManagementPostCategory
  content: string
  image_url: string | null
}): Promise<{ data: ManagementPost } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  const role = await getCurrentUserRole(userId)
  if (!role || !isAdminOrManagement(role)) return { error: 'You do not have permission to post announcements.' }

  try {
    const rows = await sql<ManagementPost[]>`
      INSERT INTO management_posts (author_id, title, category, content, image_url)
      VALUES (${userId}, ${input.title}, ${input.category}, ${input.content}, ${input.image_url})
      RETURNING *
    `
    return { data: rows[0] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create post.' }
  }
}

/** management_posts DELETE: role IN ('management','admin') — any such post, not just one's own. */
export async function deleteManagementPost(postId: string): Promise<{ data: true } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  const role = await getCurrentUserRole(userId)
  if (!role || !isAdminOrManagement(role)) return { error: 'You do not have permission to delete announcements.' }

  try {
    await sql`DELETE FROM management_posts WHERE id = ${postId}`
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete post.' }
  }
}

/**
 * management_post_reactions INSERT: profile_id = current user (self only,
 * no role gate). One reaction per (post, user) - see
 * management-post-reactions-one-per-user-2026-09-18.sql - so reacting
 * with a different emoji than your existing one on this post replaces
 * it, rather than adding a second reaction.
 */
export async function addPostReaction(postId: string, emoji: string): Promise<{ data: ManagementPostReaction } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  try {
    const rows = await sql<ManagementPostReaction[]>`
      INSERT INTO management_post_reactions (post_id, profile_id, emoji)
      VALUES (${postId}, ${userId}, ${emoji})
      ON CONFLICT (post_id, profile_id) DO UPDATE SET emoji = EXCLUDED.emoji
      RETURNING *
    `
    return { data: rows[0] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to react to post.' }
  }
}

/** management_post_reactions DELETE: profile_id = current user (self only). */
export async function removePostReaction(postId: string, emoji: string): Promise<{ data: true } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  try {
    await sql`DELETE FROM management_post_reactions WHERE post_id = ${postId} AND profile_id = ${userId} AND emoji = ${emoji}`
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to remove reaction.' }
  }
}

/**
 * agent_kudos INSERT: created_by = current user AND role IN
 * ('management','admin'). No UPDATE/DELETE per the table's rules.
 */
export async function createAgentKudos(input: {
  agentId: string
  note: string
  customerName: string | null
  rating: number
}): Promise<{ data: AgentKudos } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }

  const role = await getCurrentUserRole(userId)
  if (!role || !isAdminOrManagement(role)) return { error: 'You do not have permission to add testimonials.' }

  const rating = Number.isFinite(input.rating) ? Math.min(5, Math.max(1, Math.trunc(input.rating))) : 5

  try {
    const rows = await sql<AgentKudos[]>`
      INSERT INTO agent_kudos (agent_id, note, customer_name, rating, created_by)
      VALUES (${input.agentId}, ${input.note}, ${input.customerName}, ${rating}, ${userId})
      RETURNING *
    `
    return { data: rows[0] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add testimonial.' }
  }
}
