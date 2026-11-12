'use server'

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { isAdminOrManagement } from '@/lib/auth/authz'
import { requireUser, type AuthedUser } from '@/lib/auth/requireUser'
import { getActiveAssistanceForCustomer } from './getActiveAssistance'
import { getTicketHistoryForCustomer } from '@/lib/customers/getTicketHistory'
import { logTicketActivity } from './logActivity'
import { ActiveAssistanceRecord, ActiveAssistanceSource, TicketHistoryRecord } from '@/types'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

// Phase 2 ("dissolve the wall" between T2 and Social queues): any
// authenticated user may self-claim any active-assistance record regardless
// of source type — no new eligibility system beyond "can you reach /tickets
// at all," which proxy.ts already governs. Previously gated on
// isRestrictedT2Agent(auth) for non-t2_ticket sources; that block blocked a
// T2-restricted agent from self-claiming a Social-side ticket, contradicting
// this goal, so it's gone.
function canSelfClaim(): boolean {
  return true
}

// Reassigning to a THIRD PARTY (not self) is a team-lead/management action,
// matching T2's existing reassignCallbackAction precedent — wider than
// reassignFollowupAction's owner-or-admin/management rule, deliberately:
// team leads already do cross-agent handoffs elsewhere (sendCallbackToLateShift).
function canReassignToOthers(auth: AuthedUser): boolean {
  return isAdminOrManagement(auth.role) || auth.role === 'team_leader'
}

class TransferError extends Error {}

async function transferOwnership(
  source: ActiveAssistanceSource,
  sourceId: string,
  actorId: string,
  toAgentId: string,
): Promise<{ previousAgentId: string | null }> {
  return withTransaction(async (tx) => {
    let previousAgentId: string | null
    let customerId: string | null
    let followupId: string | null = null
    let callbackId: string | null = null

    switch (source) {
      case 'support_ticket': {
        const [existing] = await tx<{ agent_id: string; customer_id: string }[]>`
          SELECT agent_id, customer_id FROM support_tickets WHERE id = ${sourceId}
        `
        if (!existing) throw new TransferError('Support ticket not found.')
        await tx`UPDATE support_tickets SET agent_id = ${toAgentId}, updated_at = now() WHERE id = ${sourceId}`
        previousAgentId = existing.agent_id
        customerId = existing.customer_id
        break
      }
      case 'followup': {
        const [existing] = await tx<{ agent_id: string; customer_id: string }[]>`
          SELECT agent_id, customer_id FROM followups WHERE id = ${sourceId}
        `
        if (!existing) throw new TransferError('Follow-up not found.')
        await tx`UPDATE followups SET agent_id = ${toAgentId}, updated_at = now() WHERE id = ${sourceId}`
        previousAgentId = existing.agent_id
        customerId = existing.customer_id
        followupId = sourceId
        break
      }
      case 'callback': {
        const [existing] = await tx<{ agent_id: string; customer_id: string | null }[]>`
          SELECT agent_id, customer_id FROM callbacks WHERE id = ${sourceId}
        `
        if (!existing) throw new TransferError('Callback not found.')
        if (!existing.customer_id) throw new TransferError('This callback has no linked customer.')
        await tx`UPDATE callbacks SET agent_id = ${toAgentId}, updated_at = now() WHERE id = ${sourceId}`
        previousAgentId = existing.agent_id
        customerId = existing.customer_id
        callbackId = sourceId
        break
      }
      case 't2_ticket': {
        // assigned_to has existed since the T2 merge but is written here for
        // the first time — every existing read path (isOwnTicket, both
        // list-page scope filters, the detail-page gate) already relies on
        // it, so this just starts populating a column that was always load-bearing.
        const [existing] = await tx<{ assigned_to: string | null; customer_id: string | null }[]>`
          SELECT assigned_to, customer_id FROM tickets WHERE id = ${sourceId}
        `
        if (!existing) throw new TransferError('T2 ticket not found.')
        if (!existing.customer_id) throw new TransferError('This ticket has no linked customer.')
        await tx`UPDATE tickets SET assigned_to = ${toAgentId} WHERE id = ${sourceId}`
        previousAgentId = existing.assigned_to
        customerId = existing.customer_id
        break
      }
    }

    const txSql = tx as unknown as typeof sql
    await logTicketActivity(txSql, {
      sourceType: source, sourceId, customerId: customerId!, actorId,
      eventType: 'ownership_transferred', fromAgentId: previousAgentId, toAgentId,
    })

    if (previousAgentId && previousAgentId !== toAgentId) {
      await tx`
        INSERT INTO notifications (recipient_id, sender_id, followup_id, callback_id, title, message, type)
        VALUES (
          ${previousAgentId}, ${actorId}, ${followupId}, ${callbackId},
          'Ticket ownership transferred',
          'Another agent has taken over a ticket you were handling.',
          'info'
        )
      `
    }

    return { previousAgentId }
  })
}

/** Self-service take-over of an active ticket someone else currently holds. */
export async function claimActiveAssistanceAction(
  source: ActiveAssistanceSource,
  sourceId: string,
): Promise<ActionResult<{ previousAgentId: string | null }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (!canSelfClaim()) return { error: 'You do not have access to this queue.' }

  try {
    const result = await transferOwnership(source, sourceId, auth.userId, auth.userId)
    return { data: result }
  } catch (error) {
    if (error instanceof TransferError) return { error: error.message }
    console.error('claimActiveAssistanceAction failed', error)
    return { error: 'Could not take ownership of this ticket.' }
  }
}

/** Team-lead/management-only reassignment of an active ticket to a third party. */
export async function reassignActiveAssistanceAction(
  source: ActiveAssistanceSource,
  sourceId: string,
  toAgentId: string,
): Promise<ActionResult<{ previousAgentId: string | null }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (!canReassignToOthers(auth)) return { error: 'Only a team leader or management can reassign to another agent.' }

  try {
    const result = await transferOwnership(source, sourceId, auth.userId, toAgentId)
    return { data: result }
  } catch (error) {
    if (error instanceof TransferError) return { error: error.message }
    console.error('reassignActiveAssistanceAction failed', error)
    return { error: 'Could not reassign this ticket.' }
  }
}

/** Read-only check, wrapped for client components that can't call the server-only function directly. */
export async function getActiveAssistanceAction(customerId: string): Promise<ActionResult<ActiveAssistanceRecord[]>> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Unauthorized' }

  try {
    const records = await getActiveAssistanceForCustomer(customerId)
    return { data: records }
  } catch (error) {
    console.error('getActiveAssistanceAction failed', error)
    return { error: 'Could not check for active assistance.' }
  }
}

/** Full per-customer ticket history (every status, not just active) — the unified Tickets page's customer panel. */
export async function getTicketHistoryAction(customerId: string): Promise<ActionResult<TicketHistoryRecord[]>> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Unauthorized' }

  try {
    const records = await getTicketHistoryForCustomer(customerId)
    return { data: records }
  } catch (error) {
    console.error('getTicketHistoryAction failed', error)
    return { error: 'Could not load ticket history.' }
  }
}
