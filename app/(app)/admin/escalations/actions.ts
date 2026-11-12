'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { isAdminOrManagement, type Role } from '@/lib/auth/authz'
import { notifyTeamLeadersIfOffTomorrow } from '@/lib/roster/scheduleAlerts'
import { Followup, Priority } from '@/types'

/**
 * Server action backing components/admin/EscalationManager.tsx's "Send
 * Escalation" form. This page is admin-only at the route level (see
 * proxy.ts's /admin/* gate), but that gate alone is no longer sufficient
 * once this insert stops going through RLS, so the role check below is the
 * actual enforcement for who may create an escalation.
 */
export async function createEscalationAction(input: {
  agentId: string
  customerId: string
  queryDescription: string
  possibleSolution: string
  priority: Priority
  dueDate: string | null
  categoryId: string
}): Promise<Followup> {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated.')

  const roleRows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  const role = roleRows[0]?.role
  if (!role || !isAdminOrManagement(role)) throw new Error('You are not authorized to create escalations.')

  const customerRows = await sql<{ name: string }[]>`SELECT name FROM customers WHERE id = ${input.customerId}`
  const customerName = customerRows[0]?.name ?? 'Unknown customer'
  const notificationTitle = `Escalation: ${customerName}`

  const created = await withTransaction(async (tx) => {
    const inserted = await tx<Followup[]>`
      INSERT INTO followups (
        customer_id, agent_id, created_by, type, query_description,
        possible_solution, priority, due_date, status, category_id
      )
      VALUES (
        ${input.customerId}, ${input.agentId}, ${userId}, ${'escalation'}, ${input.queryDescription},
        ${input.possibleSolution || null}, ${input.priority}, ${input.dueDate}, ${'open'}, ${input.categoryId}
      )
      RETURNING *
    `
    const escalation = inserted[0]
    await tx`
      INSERT INTO notifications (recipient_id, sender_id, followup_id, title, message, type)
      VALUES (${input.agentId}, ${userId}, ${escalation.id}, ${notificationTitle}, ${input.queryDescription}, ${'escalation'})
    `
    return inserted
  })

  // Escalations are now managed on the Admin Dashboard ("Workflows") itself
  // — there's no standalone /admin/escalations page anymore.
  revalidatePath('/admin')

  // Best-effort — never blocks or fails this action; see the function's own doc comment.
  await notifyTeamLeadersIfOffTomorrow(input.agentId, created[0].id, 'this escalation', input.queryDescription)

  return created[0]
}
