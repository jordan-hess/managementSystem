'use server'

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { isAdminOrManagement } from '@/lib/auth/authz'
import { getISOWeekStart, getIsoDayOfWeek, formatDateKey } from '@/lib/roster/calendarUtils'
import { notifyTeamLeadersIfOffTomorrow } from '@/lib/roster/scheduleAlerts'
import { format } from 'date-fns'
import { createWithDuplicateCheck } from '@/lib/activeAssistance/createWithDuplicateCheck'
import { requireUser } from '@/lib/auth/requireUser'
import { normalizeCallbackContact, manualCallbackLabel } from '@/lib/callbacks/contact'
import type { Callback, CallbackStatus, CreateCheckResult, Followup, FollowupStatus, FollowupStatusHistory, Priority, Role, SupportTicket, SupportTicketChannel, SupportTicketStatus, SupportTicketStatusHistory } from '@/types'

/**
 * Server actions backing FollowupManager.tsx and AssignFollowupModal.tsx —
 * ported off direct `supabase.from('followups'|'followup_status_history'|
 * 'customers'|'notifications')` calls made from the browser. There is no
 * RLS left in the DB; every check below is the app-code replacement for the
 * final (post-migration) Postgres policies. See lib/auth/authz.ts and the
 * migrations under Database/migrations/ for the source rules:
 *   - followups SELECT:  agent_id = caller OR created_by = caller OR caller is admin/management
 *   - followups INSERT:  created_by = caller (set server-side here, never client-supplied)
 *   - followups UPDATE:  agent_id = caller OR caller is admin/management
 *   - followup_status_history SELECT: caller could see the parent followup
 *   - followup_status_history INSERT: changed_by = caller AND caller could see the parent followup
 *   - notifications INSERT: unrestricted — any authenticated user
 *   - customers INSERT: created_by = caller (Database/schema.sql "Agents can insert customers")
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

interface ExistingFollowup {
  agent_id: string | null
  created_by: string | null
  status: FollowupStatus
}

async function loadExistingFollowup(id: string): Promise<ExistingFollowup | null> {
  const rows = await sql<ExistingFollowup[]>`
    SELECT agent_id, created_by, status FROM followups WHERE id = ${id}
  `
  return rows[0] ?? null
}

// ─── followups: create/update (FollowupManager's own self-service modal) ────

export interface FollowupSaveInput {
  customer_id: string
  query_description: string
  possible_solution: string | null
  priority: Priority
  due_date: string | null
  resolution_notes: string | null
  status: FollowupStatus
  category_id: string | null
  cancellation_reason: string | null
  collection_address: string | null
  queue: string | null
}

/** Create a follow-up for the caller themselves (agent_id = created_by = caller). */
export async function createFollowupAction(
  input: FollowupSaveInput,
  overrideDuplicateWarning = false,
): Promise<CreateCheckResult<Followup>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId } = auth

  const resolvedAt = input.status === 'resolved' ? new Date().toISOString() : null

  try {
    const result = await createWithDuplicateCheck<Followup>({
      customerId: input.customer_id,
      actorId: userId,
      overrideDuplicateWarning,
      insert: async (tx) => {
        const rows = await tx<Followup[]>`
          INSERT INTO followups (
            customer_id, agent_id, created_by, type, query_description, possible_solution,
            status, priority, due_date, resolution_notes, resolved_at, category_id,
            cancellation_reason, collection_address, queue
          ) VALUES (
            ${input.customer_id}, ${userId}, ${userId}, 'followup', ${input.query_description},
            ${input.possible_solution}, ${input.status}, ${input.priority}, ${input.due_date},
            ${input.resolution_notes}, ${resolvedAt}, ${input.category_id},
            ${input.cancellation_reason}, ${input.collection_address}, ${input.queue}
          )
          RETURNING *
        `
        return { row: rows[0], sourceType: 'followup', sourceId: rows[0].id }
      },
    })
    if ('data' in result && result.data) {
      await notifyTeamLeadersIfOffTomorrow(userId, result.data.id, 'this follow-up', input.query_description)
    }
    return result
  } catch (error) {
    console.error('createFollowupAction failed', error)
    return { error: 'Could not create follow-up.' }
  }
}

/** Full-field update, no reassignment. Used by FollowupManager's own edit modal. */
export async function updateFollowupAction(id: string, input: FollowupSaveInput): Promise<ActionResult<Followup>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const existing = await loadExistingFollowup(id)
  if (!existing) return { error: 'Follow-up not found.' }
  if (existing.agent_id !== userId && !isAdminOrManagement(role)) {
    return { error: 'Forbidden' }
  }

  const resolvedAt = input.status === 'resolved' ? new Date().toISOString() : null

  try {
    const updated = await withTransaction(async (tx) => {
      const rows = await tx<Followup[]>`
        UPDATE followups SET
          customer_id = ${input.customer_id},
          query_description = ${input.query_description},
          possible_solution = ${input.possible_solution},
          priority = ${input.priority},
          due_date = ${input.due_date},
          resolution_notes = ${input.resolution_notes},
          status = ${input.status},
          resolved_at = ${resolvedAt},
          category_id = ${input.category_id},
          cancellation_reason = ${input.cancellation_reason},
          collection_address = ${input.collection_address},
          queue = ${input.queue}
        WHERE id = ${id}
        RETURNING *
      `
      if (input.status !== existing.status) {
        await tx`
          INSERT INTO followup_status_history (followup_id, changed_by, from_status, to_status)
          VALUES (${id}, ${userId}, ${existing.status}, ${input.status})
        `
      }
      return rows[0]
    })
    return { data: updated }
  } catch (error) {
    console.error('updateFollowupAction failed', error)
    return { error: 'Could not update follow-up.' }
  }
}

/** Status-only quick update (the "Start working" / "Mark as Complete" buttons). */
export async function updateFollowupStatusAction(id: string, status: FollowupStatus): Promise<ActionResult<Followup>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const existing = await loadExistingFollowup(id)
  if (!existing) return { error: 'Follow-up not found.' }
  if (existing.agent_id !== userId && !isAdminOrManagement(role)) {
    return { error: 'Forbidden' }
  }

  const resolvedAt = (status === 'resolved' || status === 'closed') ? new Date().toISOString() : null

  try {
    const updated = await withTransaction(async (tx) => {
      const rows = await tx<Followup[]>`
        UPDATE followups SET status = ${status}, resolved_at = ${resolvedAt}
        WHERE id = ${id}
        RETURNING *
      `
      if (status !== existing.status) {
        await tx`
          INSERT INTO followup_status_history (followup_id, changed_by, from_status, to_status)
          VALUES (${id}, ${userId}, ${existing.status}, ${status})
        `
      }
      return rows[0]
    })
    return { data: updated }
  } catch (error) {
    console.error('updateFollowupStatusAction failed', error)
    return { error: 'Could not update status.' }
  }
}

// ─── followups: assign/reassign (AssignFollowupModal, management/admin) ────

export interface AssignFollowupCreateInput extends FollowupSaveInput {
  agent_id: string
  customerLabel: string
}

/** Create a follow-up assigned to someone else (and notify them), or to the caller when no assignee is given. */
export async function assignFollowupAction(
  input: AssignFollowupCreateInput,
  overrideDuplicateWarning = false,
): Promise<CreateCheckResult<Followup>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId } = auth
  const agentId = input.agent_id || userId

  try {
    const result = await createWithDuplicateCheck<Followup>({
      customerId: input.customer_id,
      actorId: userId,
      overrideDuplicateWarning,
      insert: async (tx) => {
        const rows = await tx<Followup[]>`
          INSERT INTO followups (
            customer_id, agent_id, created_by, type, query_description, possible_solution,
            status, priority, due_date, resolution_notes, resolved_at, category_id,
            cancellation_reason, collection_address
          ) VALUES (
            ${input.customer_id}, ${agentId}, ${userId}, 'followup', ${input.query_description},
            ${input.possible_solution}, 'open', ${input.priority}, ${input.due_date},
            ${input.resolution_notes}, null, ${input.category_id},
            ${input.cancellation_reason}, ${input.collection_address}
          )
          RETURNING *
        `
        const followup = rows[0]
        if (agentId !== userId) {
          await tx`
            INSERT INTO notifications (recipient_id, sender_id, followup_id, title, message, type)
            VALUES (
              ${agentId}, ${userId}, ${followup.id},
              ${`New follow-up: ${input.customerLabel}`}, ${input.query_description}, 'followup'
            )
          `
        }
        return { row: followup, sourceType: 'followup', sourceId: followup.id }
      },
    })
    if ('data' in result && result.data) {
      await notifyTeamLeadersIfOffTomorrow(agentId, result.data.id, 'this follow-up', input.query_description)
    }
    return result
  } catch (error) {
    console.error('assignFollowupAction failed', error)
    return { error: 'Could not create follow-up.' }
  }
}

export interface ReassignFollowupInput extends FollowupSaveInput {
  agent_id: string
  customerLabel: string
}

/** Full-field update including a possible reassignment; notifies the new assignee. */
export async function reassignFollowupAction(id: string, input: ReassignFollowupInput): Promise<ActionResult<Followup>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const existing = await loadExistingFollowup(id)
  if (!existing) return { error: 'Follow-up not found.' }
  if (existing.agent_id !== userId && !isAdminOrManagement(role)) {
    return { error: 'Forbidden' }
  }

  const resolvedAt = input.status === 'resolved' ? new Date().toISOString() : null

  try {
    const updated = await withTransaction(async (tx) => {
      const rows = await tx<Followup[]>`
        UPDATE followups SET
          customer_id = ${input.customer_id},
          agent_id = ${input.agent_id},
          query_description = ${input.query_description},
          possible_solution = ${input.possible_solution},
          priority = ${input.priority},
          due_date = ${input.due_date},
          resolution_notes = ${input.resolution_notes},
          status = ${input.status},
          resolved_at = ${resolvedAt},
          category_id = ${input.category_id},
          cancellation_reason = ${input.cancellation_reason},
          collection_address = ${input.collection_address}
        WHERE id = ${id}
        RETURNING *
      `
      if (input.status !== existing.status) {
        await tx`
          INSERT INTO followup_status_history (followup_id, changed_by, from_status, to_status)
          VALUES (${id}, ${userId}, ${existing.status}, ${input.status})
        `
      }
      if (input.agent_id !== existing.agent_id && input.agent_id !== userId) {
        await tx`
          INSERT INTO notifications (recipient_id, sender_id, followup_id, title, message, type)
          VALUES (
            ${input.agent_id}, ${userId}, ${id},
            ${`Follow-up reassigned to you: ${input.customerLabel}`}, ${input.query_description}, 'followup'
          )
        `
      }
      return rows[0]
    })
    return { data: updated }
  } catch (error) {
    console.error('reassignFollowupAction failed', error)
    return { error: 'Could not update follow-up.' }
  }
}

// ─── followup_status_history: read (StatusHistoryTimeline in the edit modal) ─

export async function getFollowupHistoryAction(followupId: string): Promise<ActionResult<FollowupStatusHistory[]>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const existing = await loadExistingFollowup(followupId)
  if (!existing) return { error: 'Follow-up not found.' }
  const canView = existing.agent_id === userId || existing.created_by === userId || isAdminOrManagement(role)
  if (!canView) return { error: 'Forbidden' }

  try {
    const rows = await sql<FollowupStatusHistory[]>`
      SELECT h.*, jsonb_build_object('full_name', COALESCE(p.full_name, 'Deleted user')) AS profiles
      FROM followup_status_history h
      LEFT JOIN profiles p ON p.id = h.changed_by
      WHERE h.followup_id = ${followupId}
      ORDER BY h.changed_at ASC
    `
    return { data: rows }
  } catch (error) {
    console.error('getFollowupHistoryAction failed', error)
    return { error: 'Could not load status history.' }
  }
}

// ─── callbacks: create/update/status (CallbackManager) ──────────────────────
// Recovered after a concurrent migration agent's Write clobbered this file's
// earlier callbacks-actions pass — reconstructed from the original
// Supabase-based components/callbacks/{CallbackManager,RescheduleModal}.tsx
// (git show HEAD:...) to preserve exact prior behavior, plus the
// callbacks-authorization rule (agent_id = caller OR role = 'admin' for
// update/status/reschedule; same check gates the late-shift handoff, whose
// WITH CHECK-only widening in the old RLS only ever permitted the *new*
// agent_id to be a team leader — not a different set of callers — so this
// still requires the caller to already own the callback or be admin).

type CallbackFields = {
  scheduled_at: string
  query_description: string
  possible_solution: string | null
  notes: string | null
  status: CallbackStatus
  completed_at: string | null
  queue: string | null
}

/** Either a customer callback (customer_id set) or a manual one (customer_id null + contact details). */
export type CallbackSaveInput =
  | (CallbackFields & { customer_id: string; contact?: undefined })
  | (CallbackFields & { customer_id: null; contact: { name: string | null; email: string | null; phone: string | null } })

interface ExistingCallback {
  agent_id: string | null
  customer_id?: string | null
  notes: string | null
  scheduled_at: string
}

async function loadExistingCallback(id: string): Promise<ExistingCallback | null> {
  const rows = await sql<ExistingCallback[]>`
    SELECT agent_id, customer_id, notes, scheduled_at FROM callbacks WHERE id = ${id}
  `
  return rows[0] ?? null
}

/** Logs the Postgres error name, code, constraint and message, but never `detail`: a CHECK violation's detail carries the failing row (personal data). */
function logCallbackError(label: string, error: unknown) {
  const e = error as { name?: string; code?: string; constraint_name?: string; message?: string } | null
  console.error(label, { name: e?.name, code: e?.code, constraint: e?.constraint_name, message: e?.message })
}

function canMutateCallback(existing: ExistingCallback, userId: string, role: Role): boolean {
  return existing.agent_id === userId || role === 'admin'
}

async function createManualCallback(
  input: Extract<CallbackSaveInput, { customer_id: null }>,
  agentId: string,
  userId: string,
): Promise<CreateCheckResult<Callback>> {
  const parsed = normalizeCallbackContact(input.contact ?? {})
  if (!parsed.ok) return { error: Object.values(parsed.errors)[0] ?? 'Invalid contact details.' }
  const contact = parsed.value

  try {
    return await withTransaction(async (tx) => {
      const rows = await tx<Callback[]>`
        INSERT INTO callbacks (
          customer_id, contact_name, contact_email, contact_phone, agent_id, created_by, scheduled_at,
          query_description, possible_solution, notes, status, completed_at, queue
        ) VALUES (
          NULL, ${contact.name}, ${contact.email}, ${contact.phone}, ${agentId}, ${userId}, ${input.scheduled_at},
          ${input.query_description}, ${input.possible_solution}, ${input.notes}, ${input.status}, ${input.completed_at}, ${input.queue}
        )
        RETURNING *
      `
      const callback = rows[0]

      if (agentId !== userId) {
        const label = manualCallbackLabel(contact.name)
        const when = format(new Date(input.scheduled_at), "dd MMM yyyy 'at' HH:mm")
        await tx`
          INSERT INTO notifications (recipient_id, sender_id, callback_id, title, message, type)
          VALUES (
            ${agentId}, ${userId}, ${callback.id},
            ${`New Callback Assigned: ${label}`},
            ${`You have been assigned a callback with ${label} on ${when}.`},
            'callback'
          )
        `
      }
      return { data: callback }
    })
  } catch (error) {
    logCallbackError('createManualCallback failed', error)
    return { error: 'Could not create callback.' }
  }
}

/** Create a callback, optionally assigning it to someone else (admin only). */
export async function createCallback(
  input: CallbackSaveInput,
  targetAgentId: string,
  overrideDuplicateWarning = false,
): Promise<CreateCheckResult<Callback>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const agentId = targetAgentId && targetAgentId !== userId && role === 'admin' ? targetAgentId : userId

  if (input.customer_id !== null && input.contact) return { error: 'Choose either a customer or callback details, not both.' }
  if (input.customer_id === null) return createManualCallback(input, agentId, userId)

  try {
    return await createWithDuplicateCheck<Callback>({
      customerId: input.customer_id,
      actorId: userId,
      overrideDuplicateWarning,
      insert: async (tx) => {
        const rows = await tx<Callback[]>`
          INSERT INTO callbacks (
            customer_id, agent_id, created_by, scheduled_at, query_description,
            possible_solution, notes, status, completed_at, queue
          ) VALUES (
            ${input.customer_id}, ${agentId}, ${userId}, ${input.scheduled_at}, ${input.query_description},
            ${input.possible_solution}, ${input.notes}, ${input.status}, ${input.completed_at}, ${input.queue}
          )
          RETURNING *
        `
        const callback = rows[0]

        if (agentId !== userId) {
          const [customer] = await tx<{ name: string }[]>`SELECT name FROM customers WHERE id = ${input.customer_id}`
          const when = format(new Date(input.scheduled_at), "dd MMM yyyy 'at' HH:mm")
          await tx`
            INSERT INTO notifications (recipient_id, sender_id, callback_id, title, message, type)
            VALUES (
              ${agentId}, ${userId}, ${callback.id},
              ${`New Callback Assigned: ${customer?.name ?? 'Unknown'}`},
              ${`You have been assigned a callback with ${customer?.name ?? 'a customer'} on ${when}.`},
              'callback'
            )
          `
        }
        return { row: callback, sourceType: 'callback', sourceId: callback.id }
      },
    })
  } catch (error) {
    logCallbackError('createCallback failed', error)
    return { error: 'Could not create callback.' }
  }
}

/** Full-field edit, no reassignment (matches the original edit modal — agent_id is not editable here). */
export async function updateCallback(id: string, input: CallbackSaveInput): Promise<ActionResult<Callback>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const existing = await loadExistingCallback(id)
  if (!existing) return { error: 'Callback not found.' }
  if (!canMutateCallback(existing, userId, role)) return { error: 'Forbidden' }
  if (input.customer_id !== null && input.contact) return { error: 'Choose either a customer or callback details, not both.' }

  if (existing.customer_id === null) {
    // A manual callback: contact details only, never a customer.
    if (input.customer_id !== null) return { error: 'A callback with manual details cannot be linked to a customer here.' }
    const parsed = normalizeCallbackContact(input.contact ?? {})
    if (!parsed.ok) return { error: Object.values(parsed.errors)[0] ?? 'Invalid contact details.' }
    const contact = parsed.value
    try {
      const rows = await sql<Callback[]>`
        UPDATE callbacks SET
          contact_name = ${contact.name},
          contact_email = ${contact.email},
          contact_phone = ${contact.phone},
          scheduled_at = ${input.scheduled_at},
          query_description = ${input.query_description},
          possible_solution = ${input.possible_solution},
          notes = ${input.notes},
          status = ${input.status},
          completed_at = ${input.completed_at},
          queue = ${input.queue}
        WHERE id = ${id}
        RETURNING *
      `
      return { data: rows[0] }
    } catch (error) {
      logCallbackError('updateCallback failed', error)
      return { error: 'Could not update callback.' }
    }
  }

  if (input.customer_id === null) return { error: 'A customer callback cannot be changed into a manual one.' }

  try {
    const rows = await sql<Callback[]>`
      UPDATE callbacks SET
        customer_id = ${input.customer_id},
        scheduled_at = ${input.scheduled_at},
        query_description = ${input.query_description},
        possible_solution = ${input.possible_solution},
        notes = ${input.notes},
        status = ${input.status},
        completed_at = ${input.completed_at},
        queue = ${input.queue}
      WHERE id = ${id}
      RETURNING *
    `
    return { data: rows[0] }
  } catch (error) {
    logCallbackError('updateCallback failed', error)
    return { error: 'Could not update callback.' }
  }
}

/** Status-only quick update ("Mark complete" button). */
export async function updateCallbackStatus(id: string, status: CallbackStatus): Promise<ActionResult<Callback>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const existing = await loadExistingCallback(id)
  if (!existing) return { error: 'Callback not found.' }
  if (!canMutateCallback(existing, userId, role)) return { error: 'Forbidden' }

  const completedAt = status === 'completed' ? new Date().toISOString() : null

  try {
    const rows = await sql<Callback[]>`
      UPDATE callbacks SET status = ${status}, completed_at = ${completedAt}
      WHERE id = ${id}
      RETURNING *
    `
    return { data: rows[0] }
  } catch (error) {
    logCallbackError('updateCallbackStatus failed', error)
    return { error: 'Could not update status.' }
  }
}

/** Pick a new date/time; resets status to pending and appends a note, matching the original behavior. */
export async function rescheduleCallback(id: string, newScheduledAtIso: string): Promise<ActionResult<Callback>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const existing = await loadExistingCallback(id)
  if (!existing) return { error: 'Callback not found.' }
  if (!canMutateCallback(existing, userId, role)) return { error: 'Forbidden' }

  const oldWhen = format(new Date(existing.scheduled_at), "dd MMM yyyy 'at' HH:mm")
  const note = `Rescheduled from ${oldWhen}.${existing.notes ? `\n${existing.notes}` : ''}`

  try {
    const rows = await sql<Callback[]>`
      UPDATE callbacks SET scheduled_at = ${newScheduledAtIso}, status = 'pending', notes = ${note}
      WHERE id = ${id}
      RETURNING *
    `
    return { data: rows[0] }
  } catch (error) {
    logCallbackError('rescheduleCallback failed', error)
    return { error: 'Could not reschedule callback.' }
  }
}

/**
 * Hand a callback off to whichever team is rostered on a late shift for its
 * scheduled date, reassigning it to that team's leader. New agent_id is
 * always derived from team_leaders, so it's always a team-leader profile —
 * satisfying the old WITH CHECK's "new agent_id must be a team leader"
 * invariant by construction.
 */
export async function sendCallbackToLateShift(id: string): Promise<ActionResult<Callback>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const existing = await loadExistingCallback(id)
  if (!existing) return { error: 'Callback not found.' }
  if (!canMutateCallback(existing, userId, role)) return { error: 'Forbidden' }

  const scheduledDate = new Date(existing.scheduled_at)
  const weekStart = formatDateKey(getISOWeekStart(scheduledDate))
  const isoDow = getIsoDayOfWeek(scheduledDate)

  try {
    const rotations = await sql<{
      team_id: string
      team_name: string
      work_days: number[]
      is_late_shift: boolean
    }[]>`
      SELECT tr.team_id, t.name AS team_name, st.work_days, st.is_late_shift
      FROM team_rotations tr
      JOIN teams t ON t.id = tr.team_id
      JOIN shift_templates st ON st.id = tr.shift_template_id
      WHERE tr.week_start_date = ${weekStart}
    `

    const match = rotations.find(r => r.is_late_shift && r.work_days.includes(isoDow))
    if (!match) {
      return { error: 'No late-shift team is rostered for this date. Please pick a new date/time instead.' }
    }

    const [leaderRow] = await sql<{ profile_id: string }[]>`
      SELECT profile_id FROM team_leaders WHERE team_id = ${match.team_id} LIMIT 1
    `
    if (!leaderRow) {
      return { error: `${match.team_name} has no team leader assigned yet. Please pick a new date/time instead.` }
    }

    const [customer] = await sql<{ name: string | null }[]>`
      SELECT COALESCE(cu.name, c.contact_name) AS name
      FROM callbacks c LEFT JOIN customers cu ON cu.id = c.customer_id WHERE c.id = ${id}
    `

    const label = customer?.name ?? manualCallbackLabel(null)
    const updated = await withTransaction(async (tx) => {
      const rows = await tx<Callback[]>`
        UPDATE callbacks SET agent_id = ${leaderRow.profile_id}, status = 'pending'
        WHERE id = ${id}
        RETURNING *
      `
      const when = format(scheduledDate, "dd MMM yyyy 'at' HH:mm")
      await tx`
        INSERT INTO notifications (recipient_id, sender_id, callback_id, title, message, type)
        VALUES (
          ${leaderRow.profile_id}, ${userId}, ${id},
          ${`Late-Shift Callback: ${label}`},
          ${`A callback with ${label} scheduled for ${when} has been handed off to ${match.team_name} for late-shift coverage.`},
          'callback'
        )
      `
      return rows[0]
    })
    return { data: updated }
  } catch (error) {
    logCallbackError('sendCallbackToLateShift failed', error)
    return { error: 'Could not send to late shift.' }
  }
}

// customers: create — relocated to lib/customers/actions.ts (Phase 2, so
// AssignFollowupModal.tsx and T2's CreateTicketModal.tsx can share it from a
// route-agnostic location instead of this route's own actions file).

// ─── support_tickets: create/update/complete (SupportTicketManager) ────────
// Ported off direct `supabase.from('support_tickets')` calls made from the
// browser. Rules (Database/migrations/support-tickets-schema.sql):
//   - support_tickets SELECT: agent_id = caller OR created_by = caller OR caller is admin/management
//   - support_tickets INSERT: created_by = caller (set server-side here, never client-supplied)
//   - support_tickets UPDATE: agent_id = caller OR caller is admin/management — and since the
//     UPDATE policy has no separate WITH CHECK, Postgres reuses the USING expression as the
//     check on the NEW row too, so a non-admin/management caller can never reassign agent_id
//     away from themselves. No DELETE policy exists, so no delete action is exposed here.

export interface SupportTicketSaveInput {
  customer_id: string
  agent_id: string
  channel: SupportTicketChannel
  reference: string | null
  query_description: string
  query_type: string | null
  issue_type: string | null
  root_cause: string | null
  priority: Priority
  due_date: string | null
  status: SupportTicketStatus
  resolution_notes: string | null
  escalation_destination: string | null
  escalation_notes: string | null
  followup_notes: string | null
  followup_scheduled_at: string | null
  callback_notes: string | null
  callback_scheduled_at: string | null
}

interface ExistingSupportTicket {
  agent_id: string | null
  created_by: string | null
  status: SupportTicketStatus
}

async function loadExistingSupportTicket(id: string): Promise<ExistingSupportTicket | null> {
  const rows = await sql<ExistingSupportTicket[]>`
    SELECT agent_id, created_by, status FROM support_tickets WHERE id = ${id}
  `
  return rows[0] ?? null
}

/**
 * Server-side mirror of SupportTicketModal's client-side required-field
 * checks for the status control — belt-and-braces since a Server Action is
 * its own request boundary (same rationale as lib/auth/requireUser.ts's
 * isRestrictedT2Agent comment).
 */
function validateStatusFields(input: SupportTicketSaveInput): string | null {
  if (input.status === 'escalated' && !input.escalation_destination?.trim()) {
    return 'Escalation destination is required.'
  }
  if (input.status === 'follow_up' && (!input.followup_notes?.trim() || !input.followup_scheduled_at)) {
    return 'Follow-up notes, date, and time are all required.'
  }
  if (input.status === 'callback' && (!input.callback_notes?.trim() || !input.callback_scheduled_at)) {
    return 'Callback notes, date, and time are all required.'
  }
  if ((input.status === 'resolved' || input.status === 'closed') && !input.query_type?.trim()) {
    return 'A query type is required to resolve or close a ticket.'
  }
  if ((input.status === 'resolved' || input.status === 'closed') && !input.issue_type?.trim()) {
    return 'Issue type is required to resolve or close a ticket.'
  }
  return null
}

/** Create a support ticket. agent_id may only be set away from the caller by admin/management; left empty, it's the caller. */
export async function createSupportTicketAction(
  input: SupportTicketSaveInput,
  overrideDuplicateWarning = false,
): Promise<CreateCheckResult<SupportTicket>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const validationError = validateStatusFields(input)
  if (validationError) return { error: validationError }

  const agentId = isAdminOrManagement(role) && input.agent_id ? input.agent_id : userId
  const resolvedAt = input.status === 'resolved' ? new Date().toISOString() : null

  try {
    return await createWithDuplicateCheck<SupportTicket>({
      customerId: input.customer_id,
      actorId: userId,
      overrideDuplicateWarning,
      insert: async (tx) => {
        const rows = await tx<SupportTicket[]>`
          INSERT INTO support_tickets (
            customer_id, agent_id, created_by, channel, reference, query_description, query_type,
            issue_type, root_cause, priority, due_date, status, resolution_notes, resolved_at,
            escalation_destination, escalation_notes, followup_notes, followup_scheduled_at,
            callback_notes, callback_scheduled_at
          ) VALUES (
            ${input.customer_id}, ${agentId}, ${userId}, ${input.channel}, ${input.reference},
            ${input.query_description}, ${input.query_type}, ${input.issue_type}, ${input.root_cause},
            ${input.priority}, ${input.due_date}, ${input.status},
            ${input.resolution_notes}, ${resolvedAt},
            ${input.escalation_destination}, ${input.escalation_notes}, ${input.followup_notes}, ${input.followup_scheduled_at},
            ${input.callback_notes}, ${input.callback_scheduled_at}
          )
          RETURNING *
        `
        return { row: rows[0], sourceType: 'support_ticket', sourceId: rows[0].id }
      },
    })
  } catch (error) {
    console.error('createSupportTicketAction failed', error)
    return { error: 'Could not create support ticket.' }
  }
}

/** Full-field update. agent_id may only be reassigned by admin/management (see rule above). */
export async function updateSupportTicketAction(id: string, input: SupportTicketSaveInput): Promise<ActionResult<SupportTicket>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const existing = await loadExistingSupportTicket(id)
  if (!existing) return { error: 'Support ticket not found.' }
  if (existing.agent_id !== userId && !isAdminOrManagement(role)) {
    return { error: 'Forbidden' }
  }

  const validationError = validateStatusFields(input)
  if (validationError) return { error: validationError }

  const agentId = isAdminOrManagement(role) ? input.agent_id : existing.agent_id
  const resolvedAt = input.status === 'resolved' ? new Date().toISOString() : null

  try {
    const updated = await withTransaction(async (tx) => {
      const rows = await tx<SupportTicket[]>`
        UPDATE support_tickets SET
          agent_id = ${agentId},
          channel = ${input.channel},
          reference = ${input.reference},
          query_description = ${input.query_description},
          query_type = ${input.query_type},
          issue_type = ${input.issue_type},
          root_cause = ${input.root_cause},
          priority = ${input.priority},
          due_date = ${input.due_date},
          status = ${input.status},
          resolution_notes = ${input.resolution_notes},
          resolved_at = ${resolvedAt},
          escalation_destination = ${input.escalation_destination},
          escalation_notes = ${input.escalation_notes},
          followup_notes = ${input.followup_notes},
          followup_scheduled_at = ${input.followup_scheduled_at},
          callback_notes = ${input.callback_notes},
          callback_scheduled_at = ${input.callback_scheduled_at},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `
      if (input.status !== existing.status) {
        await tx`
          INSERT INTO support_ticket_status_history (support_ticket_id, changed_by, from_status, to_status)
          VALUES (${id}, ${userId}, ${existing.status}, ${input.status})
        `
      }
      return rows[0]
    })
    return { data: updated }
  } catch (error) {
    console.error('updateSupportTicketAction failed', error)
    return { error: 'Could not update support ticket.' }
  }
}

/** Read-only, same ownership scope as the ticket itself. */
export async function getSupportTicketStatusHistoryAction(supportTicketId: string): Promise<ActionResult<SupportTicketStatusHistory[]>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const existing = await loadExistingSupportTicket(supportTicketId)
  if (!existing) return { error: 'Support ticket not found.' }
  if (existing.agent_id !== userId && existing.created_by !== userId && !isAdminOrManagement(role)) {
    return { error: 'Forbidden' }
  }

  try {
    const rows = await sql<SupportTicketStatusHistory[]>`
      SELECT h.*, jsonb_build_object('full_name', COALESCE(p.full_name, 'Deleted user')) AS profiles
      FROM support_ticket_status_history h
      LEFT JOIN profiles p ON p.id = h.changed_by
      WHERE h.support_ticket_id = ${supportTicketId}
      ORDER BY h.changed_at ASC
    `
    return { data: rows }
  } catch (error) {
    console.error('getSupportTicketStatusHistoryAction failed', error)
    return { error: 'Could not load status history.' }
  }
}

/** Status-only quick update (the "Mark as Complete" button). Requires Issue Type, same rule as resolving via the edit modal. */
export async function markSupportTicketCompleteAction(id: string, issueType: string, rootCause: string | null = null): Promise<ActionResult<SupportTicket>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  if (!issueType?.trim()) return { error: 'Issue type is required to close a ticket.' }

  const existing = await loadExistingSupportTicket(id)
  if (!existing) return { error: 'Support ticket not found.' }
  if (existing.agent_id !== userId && !isAdminOrManagement(role)) {
    return { error: 'Forbidden' }
  }

  try {
    const updated = await withTransaction(async (tx) => {
      const rows = await tx<SupportTicket[]>`
        UPDATE support_tickets SET
          status = 'closed', resolved_at = NOW(), updated_at = NOW(),
          issue_type = ${issueType.trim()}, root_cause = ${rootCause?.trim() || null}
        WHERE id = ${id}
        RETURNING *
      `
      if (existing.status !== 'closed') {
        await tx`
          INSERT INTO support_ticket_status_history (support_ticket_id, changed_by, from_status, to_status)
          VALUES (${id}, ${userId}, ${existing.status}, 'closed')
        `
      }
      return rows[0]
    })
    return { data: updated }
  } catch (error) {
    console.error('markSupportTicketCompleteAction failed', error)
    return { error: 'Could not mark ticket complete.' }
  }
}

// ─── single-record fetch (Phase 2's unified Tickets page deep links) ────
// Same read scope as each type's own mutation actions above — a plain
// agent can only open what they could already edit; admin/management see
// any record. Needed because the unified list is genuinely paginated (see
// lib/tickets/getUnifiedTicketList.ts) rather than holding every
// support_ticket/followup/callback in memory the way the legacy managers
// did, so a deep link (?source=&id=) or a customer-panel history row click
// has to fetch the one full record it needs to open an edit modal.

export async function getSupportTicketByIdAction(id: string): Promise<ActionResult<SupportTicket>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const rows = await sql<SupportTicket[]>`SELECT * FROM support_tickets WHERE id = ${id}`
  const ticket = rows[0]
  if (!ticket) return { error: 'Support ticket not found.' }
  if (ticket.agent_id !== userId && !isAdminOrManagement(role)) return { error: 'Forbidden' }
  return { data: ticket }
}

export async function getFollowupByIdAction(id: string): Promise<ActionResult<Followup>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const rows = await sql<Followup[]>`SELECT * FROM followups WHERE id = ${id}`
  const followup = rows[0]
  if (!followup) return { error: 'Follow-up not found.' }
  if (followup.agent_id !== userId && !isAdminOrManagement(role)) return { error: 'Forbidden' }
  return { data: followup }
}

export async function getCallbackByIdAction(id: string): Promise<ActionResult<Callback>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  const { userId, role } = auth

  const rows = await sql<Callback[]>`SELECT * FROM callbacks WHERE id = ${id}`
  const callback = rows[0]
  if (!callback) return { error: 'Callback not found.' }
  if (callback.agent_id !== userId && role !== 'admin') return { error: 'Forbidden' }
  return { data: callback }
}
