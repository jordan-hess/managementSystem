'use server'

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { createWithDuplicateCheck } from '@/lib/activeAssistance/createWithDuplicateCheck'
import { CreateCheckResult, Role } from '@/types'
import { QUEUES } from '@/lib/t2/queues'
import { SOLUTION_OUTCOMES, T3_ESCALATION_TEAMS, PRIORITIES } from '@/lib/t2/rootCauses'
import { requireUser, type AuthedUser } from '@/lib/auth/requireUser'
import { BILLING_REASONS, BILLING_AMOUNT_REASONS, isBillingAgent } from '@/lib/billing/constants'
import { Ticket, TicketEscalation, TicketEvent, TicketSolution } from '@/lib/t2/types'
import { getActiveAssistanceForCustomer } from '@/lib/activeAssistance/getActiveAssistance'
import { ActiveAssistanceRecord } from '@/types'

/**
 * T2 Queue Hub merge, Phase 2 — server actions backing the ticket workflow
 * (create/escalate/acknowledge/respond/validate/solve/close/callbacks/
 * solution review). Ported from t2-queue-hub/backend/src/routes/tickets.js's
 * Express handlers — same validation, same state-machine rules, same role
 * gates (T2's team_lead/manager renamed team_leader/management to match the
 * merged profiles.role values; req.user.team is now profile.t2_team).
 *
 * No Socket.io emission (t2-queue-hub's emitTicketUpdate) — the merge
 * decided on polling for realtime (see the merge plan's "Realtime approach"
 * section), so nothing here pushes updates; callers re-fetch instead.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

interface TicketGate {
  id: string
  status: string
  created_by: string | null
  assigned_to: string | null
  escalation_destination: string | null
}

async function loadTicket(id: string): Promise<TicketGate | null> {
  const rows = await sql<TicketGate[]>`
    SELECT id, status, created_by, assigned_to, escalation_destination FROM tickets WHERE id = ${id}
  `
  return rows[0] ?? null
}

/** Agents only ever act on tickets they raised or are assigned to. Every other role is unrestricted. */
function isOwnTicket(auth: AuthedUser, ticket: TicketGate): boolean {
  if (auth.role !== 'agent') return true
  return ticket.created_by === auth.userId || ticket.assigned_to === auth.userId
}

async function logEvent(tx: typeof sql, ticketId: string, userId: string | null, eventType: string, note?: string | null) {
  await tx`
    INSERT INTO ticket_events (ticket_id, user_id, event_type, note)
    VALUES (${ticketId}, ${userId}, ${eventType}, ${note ?? null})
  `
}

/** First diagnostic edit/note on an 'open' ticket flips it to 'in_progress' and stamps acknowledged_at. */
async function maybeStartProgress(tx: typeof sql, ticket: TicketGate) {
  if (ticket.status !== 'open') return
  const ts = nowIso()
  await tx`
    UPDATE tickets SET status = 'in_progress', acknowledged_at = COALESCE(acknowledged_at, ${ts}) WHERE id = ${ticket.id}
  `
  await logEvent(tx, ticket.id, null, 'status_change', 'Agent started troubleshooting')
}

// ─── create ──────────────────────────────────────────────────────────────

export interface CreateTicketInput {
  customer_id: string
  queue: string
  issue_type: string | null
  description: string | null
  address: string | null
  plus_code: string | null
  imsi: string | null
  msisdn: string | null
  customer_email: string | null
  regular_site: string | null
  provisioning_status: string | null
  project: string | null
  root_cause: string | null
  rsrp: string | null
  rsrq: string | null
  sinr: string | null
  serving_site: string | null
  connected_site: string | null
  band: string | null
  network_technology: string | null
  download_speed: string | null
  upload_speed: string | null
  latency: string | null
  // Advanced queue's device type field.
  device: string | null
  // Advanced queue's escalation-path classification.
  escalation_path: string | null
  // Informational "how did this end" field — every queue's form ends in
  // some notion of Outcome (fixed dropdown for Advanced, free text for SIM
  // SWAP/MNP). Recorded for reporting only, does NOT itself escalate/
  // resolve/schedule a callback — the agent still uses the ticket detail
  // page's actions for that afterward.
  outcome: string | null
  // SIM SWAP queue's own fields — ignored/left null for every other queue.
  sim_type: string | null
  swap_reason: string | null
  swap_requested_date: string | null
  swap_processed: string | null
  station_ticket_number: string | null
  // MNP (Porting) queue's own fields — ignored/left null for every other queue.
  port_in: string | null
  port_customer_experiencing_issues: string | null
  port_issue_type: string | null
  port_inquiry_type: string | null
  port_reversal_reason: string | null
  donor_isp: string | null
}

const SIM_TYPES = ['4G Mobile sim swap', '4G Data Only sim swap']

export async function createTicketAction(
  input: CreateTicketInput,
  overrideDuplicateWarning = false,
): Promise<CreateCheckResult<{ id: string; ticket_number: string }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (auth.role !== 'agent' && auth.role !== 'team_leader') return { error: 'Forbidden' }

  if (!input.customer_id) return { error: 'customer_id is required' }
  if (!input.queue) return { error: 'queue is required' }
  if (!(QUEUES as readonly string[]).includes(input.queue)) return { error: `queue must be one of: ${QUEUES.join(', ')}` }

  // SIM SWAP and MNP each have their own field set instead of the generic
  // issue_type picker — tickets.issue_type stays NOT NULL, so it's
  // auto-filled with a fixed label rather than shown to the agent for
  // those queues.
  const isSimSwap = input.queue === 'SIM SWAP'
  // The user's spec calls this "MNP - Porting" — same queue as T2's
  // existing canonical 'PORTING' value (see TEAM_TO_QUEUE's
  // 'Porting/MNP' -> 'PORTING' mapping), not a new queue.
  const isMnp = input.queue === 'PORTING'
  let issueType = input.issue_type

  if (isSimSwap) {
    if (!input.sim_type || !SIM_TYPES.includes(input.sim_type)) return { error: `sim_type must be one of: ${SIM_TYPES.join(', ')}` }
    if (!input.swap_reason) return { error: 'swap_reason is required' }
    if (!input.swap_requested_date) return { error: 'swap_requested_date is required' }
    issueType = 'SIM Swap Request'
  } else if (isMnp) {
    if (!input.port_in) return { error: 'port_in is required' }
    if (input.port_in === 'Yes') {
      if (!input.port_customer_experiencing_issues) return { error: 'port_customer_experiencing_issues is required' }
      if (input.port_customer_experiencing_issues === 'Yes' && !input.port_issue_type) {
        return { error: 'port_issue_type is required' }
      }
    } else {
      if (!input.port_inquiry_type) return { error: 'port_inquiry_type is required' }
      if (input.port_inquiry_type === 'Port reversal' && !input.port_reversal_reason) {
        return { error: 'port_reversal_reason is required' }
      }
    }
    issueType = 'Porting Request'
  } else if (!issueType) {
    return { error: 'issue_type is required' }
  }

  try {
    return await createWithDuplicateCheck<{ id: string; ticket_number: string }>({
      customerId: input.customer_id,
      actorId: auth.userId,
      overrideDuplicateWarning,
      insert: async (tx) => {
        const [{ n }] = await tx<{ n: string }[]>`SELECT nextval('ticket_number_seq') AS n`
        const ticketNumber = `T2-${n}`
        // assigned_to starts as the creator, whatever department they're in.
        // It used to be left NULL until a transfer or a callback reassign
        // wrote it, which made every freshly-raised ticket read "Unassigned"
        // in the Tickets list (the list joins the assignee's name) and made
        // the list's agent filter - which matches on assigned_to - miss the
        // tickets an agent had raised. A takeover still overwrites this;
        // created_by keeps recording who originally raised it.
        const rows = await tx<{ id: string }[]>`
          INSERT INTO tickets (
            ticket_number, customer_id, queue, issue_type, description, address, plus_code, imsi, msisdn,
            customer_email, regular_site, provisioning_status, project, root_cause, rsrp, rsrq, sinr,
            serving_site, connected_site, band, network_technology, download_speed, upload_speed, latency, device,
            escalation_path,
            outcome, sim_type, swap_reason, swap_requested_date, swap_processed, station_ticket_number,
            port_in, port_customer_experiencing_issues, port_issue_type, port_inquiry_type, port_reversal_reason, donor_isp,
            status, created_by, assigned_to
          ) VALUES (
            ${ticketNumber}, ${input.customer_id}, ${input.queue}, ${issueType}, ${input.description}, ${input.address},
            ${input.plus_code}, ${input.imsi}, ${input.msisdn}, ${input.customer_email}, ${input.regular_site},
            ${input.provisioning_status}, ${input.project}, ${input.root_cause}, ${input.rsrp}, ${input.rsrq},
            ${input.sinr}, ${input.serving_site}, ${input.connected_site}, ${input.band}, ${input.network_technology},
            ${input.download_speed}, ${input.upload_speed}, ${input.latency}, ${input.device},
            ${input.escalation_path},
            ${input.outcome},
            ${isSimSwap ? input.sim_type : null}, ${isSimSwap ? input.swap_reason : null},
            ${isSimSwap ? input.swap_requested_date : null}, ${isSimSwap ? input.swap_processed : null},
            ${isSimSwap || isMnp ? input.station_ticket_number : null},
            ${isMnp ? input.port_in : null}, ${isMnp ? input.port_customer_experiencing_issues : null},
            ${isMnp ? input.port_issue_type : null}, ${isMnp ? input.port_inquiry_type : null},
            ${isMnp ? input.port_reversal_reason : null}, ${isMnp ? input.donor_isp : null},
            'open', ${auth.userId}, ${auth.userId}
          )
          RETURNING id
        `
        const ticket = rows[0]
        await logEvent(tx as unknown as typeof sql, ticket.id, auth.userId, 'created', `Ticket created (${issueType}, ${input.queue})`)
        return { row: { id: ticket.id, ticket_number: ticketNumber }, sourceType: 't2_ticket' as const, sourceId: ticket.id }
      },
    })
  } catch (error) {
    console.error('createTicketAction failed', error)
    return { error: 'Could not create ticket.' }
  }
}

// ─── create (BILLING queue) ────────────────────────────────────────────

export interface CreateBillingTicketInput {
  customer_id: string
  channel: string // one of BILLING_CHANNELS, or free text when the UI's "Other" option was used
  reason_for_followup: string // must be one of BILLING_REASONS
  amount: number | null // required + > 0 when reason_for_followup is in BILLING_AMOUNT_REASONS, otherwise must be null
  description: string | null
}

export async function createBillingTicketAction(
  input: CreateBillingTicketInput,
  overrideDuplicateWarning = false,
): Promise<CreateCheckResult<{ id: string; ticket_number: string }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  if (auth.role === 'agent') {
    const [profile] = await sql<{ department: string | null }[]>`SELECT department FROM profiles WHERE id = ${auth.userId}`
    if (!isBillingAgent(profile)) return { error: 'Forbidden' }
  } else if (!['admin', 'management', 'hod', 'team_leader'].includes(auth.role)) {
    return { error: 'Forbidden' }
  }

  if (!input.customer_id) return { error: 'customer_id is required' }
  if (!input.channel?.trim()) return { error: 'channel is required' }
  if (!BILLING_REASONS.includes(input.reason_for_followup as (typeof BILLING_REASONS)[number])) {
    return { error: `reason_for_followup must be one of: ${BILLING_REASONS.join(', ')}` }
  }
  const needsAmount = BILLING_AMOUNT_REASONS.includes(input.reason_for_followup)
  if (needsAmount && (input.amount == null || input.amount <= 0)) return { error: 'amount is required and must be greater than 0' }
  if (!needsAmount && input.amount != null) return { error: 'amount must not be set for this reason' }

  try {
    return await createWithDuplicateCheck<{ id: string; ticket_number: string }>({
      customerId: input.customer_id,
      actorId: auth.userId,
      overrideDuplicateWarning,
      insert: async (tx) => {
        const [{ n }] = await tx<{ n: string }[]>`SELECT nextval('ticket_number_seq') AS n`
        const ticketNumber = `T2-${n}`
        // assigned_to = the raiser, same as createTicketAction - see the note there.
        const rows = await tx<{ id: string }[]>`
          INSERT INTO tickets (
            ticket_number, customer_id, queue, issue_type, channel, amount, description, status, created_by, assigned_to
          ) VALUES (
            ${ticketNumber}, ${input.customer_id}, 'BILLING', ${input.reason_for_followup}, ${input.channel.trim()},
            ${needsAmount ? input.amount : null}, ${input.description}, 'escalated', ${auth.userId}, ${auth.userId}
          )
          RETURNING id
        `
        const ticket = rows[0]
        await logEvent(tx as unknown as typeof sql, ticket.id, auth.userId, 'created', `Ticket created (${input.reason_for_followup}, BILLING) — escalated`)
        return { row: { id: ticket.id, ticket_number: ticketNumber }, sourceType: 't2_ticket' as const, sourceId: ticket.id }
      },
    })
  } catch (error) {
    console.error('createBillingTicketAction failed', error)
    return { error: 'Could not create ticket.' }
  }
}

// ─── billing status flow ────────────────────────────────────────────────
// Billing tickets deliberately skip T2's diagnostics/outcome/escalation-
// destination/solution-review workflow — that's built for network
// troubleshooting, not a billing follow-up. A ticket starts life already
// 'escalated' (that's the point of a BOPs ticket — it's raised precisely
// because it needs someone else's attention), and a Billing agent can only
// move it forward to Follow Up or Resolved from a lightweight modal
// (components/tickets/BillingStatusModal.tsx), not the full T2 detail page.
// There is no 'open' status in this flow.

export interface BillingTicketSummary {
  id: string
  ticket_number: string
  status: string
  channel: string | null
  issue_type: string | null
  amount: string | null
  description: string | null
  created_at: string
  customer_name: string | null
  customer_phone: string | null
  events: TicketEvent[]
}

// The statuses a Billing agent can actively choose. 'escalated' is also the
// ticket's starting state (see createBillingTicketAction's INSERT), but it's
// selectable too now — a Follow Up ticket can be RE-escalated (e.g. a new
// payment-allocation issue comes up on it), at which point the agent should
// be able to set/update where it's escalating to (see `channel` below).
const BILLING_SELECTABLE_STATUSES = ['follow_up', 'resolved', 'escalated'] as const

export async function getBillingTicketByIdAction(id: string): Promise<ActionResult<BillingTicketSummary>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  const rows = await sql<Omit<BillingTicketSummary, 'events'>[]>`
    SELECT t.id, t.ticket_number, t.status, t.channel, t.issue_type, t.amount, t.description, t.created_at,
      cu.name AS customer_name, cu.phone AS customer_phone
    FROM tickets t
    LEFT JOIN customers cu ON cu.id = t.customer_id
    WHERE t.id = ${id} AND t.queue = 'BILLING'
  `
  const ticket = rows[0]
  if (!ticket) return { error: 'Billing ticket not found.' }

  const gate = await loadTicket(id)
  if (gate && !isOwnTicket(auth, gate)) return { error: 'Forbidden' }

  const events = await sql<TicketEvent[]>`
    SELECT e.*, p.full_name AS user_name
    FROM ticket_events e
    LEFT JOIN profiles p ON p.id = e.user_id
    WHERE e.ticket_id = ${id}
    ORDER BY e.created_at ASC
  `

  return { data: { ...ticket, events } }
}

export async function updateBillingTicketStatusAction(
  ticketId: string,
  status: (typeof BILLING_SELECTABLE_STATUSES)[number],
  // Only meaningful (and required) when re-escalating — where the ticket
  // escalates TO (the same BILLING_CHANNELS concept as creation time; see
  // BillingStatusModal.tsx). Loose validation (non-empty only, no enum
  // check) matches createBillingTicketAction's own "channel required,
  // free-text allowed via Other" rule.
  channel?: string,
): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (!BILLING_SELECTABLE_STATUSES.includes(status)) {
    return { error: `status must be one of: ${BILLING_SELECTABLE_STATUSES.join(', ')}` }
  }
  if (status === 'escalated' && !channel?.trim()) {
    return { error: 'Escalation path (channel) is required when re-escalating.' }
  }

  const ticket = await loadTicket(ticketId)
  if (!ticket) return { error: 'Ticket not found' }
  if (!isOwnTicket(auth, ticket)) return { error: 'This ticket is not yours' }

  try {
    await withTransaction(async (tx) => {
      const ts = nowIso()
      if (status === 'resolved') {
        await tx`UPDATE tickets SET status = 'resolved', resolved_at = ${ts} WHERE id = ${ticketId}`
      } else if (status === 'escalated') {
        await tx`UPDATE tickets SET status = 'escalated', channel = ${channel!.trim()} WHERE id = ${ticketId}`
      } else {
        await tx`UPDATE tickets SET status = ${status} WHERE id = ${ticketId}`
      }
      const note = status === 'escalated' ? `Status set to escalated (escalation path: ${channel!.trim()})` : `Status set to ${status}`
      await logEvent(tx as unknown as typeof sql, ticketId, auth.userId, 'status_change', note)
    })
    return { data: true }
  } catch (error) {
    console.error('updateBillingTicketStatusAction failed', error)
    return { error: 'Could not update ticket status.' }
  }
}

// ─── unified ticket-detail modal ────────────────────────────────────────
// Every T2-table ticket (Billing included) now opens as an in-page modal
// from the unified Tickets page, matching how Social tickets already work
// — no more navigating away to /tickets/t2/[id]. The client doesn't know
// in advance whether a clicked ticket is Billing or a regular T2 queue, so
// this one action inspects it and returns whichever shape the caller needs.

export type TicketModalData =
  | { kind: 'billing'; data: BillingTicketSummary }
  | {
      kind: 't2'
      data: {
        ticket: Ticket & { customer_name: string | null; customer_phone: string | null; customer_email_onfile: string | null }
        events: TicketEvent[]
        escalations: TicketEscalation[]
        solutions: TicketSolution[]
        activeAssistance: ActiveAssistanceRecord[]
        activeAgents: { id: string; full_name: string }[]
        role: string
        t2Team: string | null
      }
    }

export async function getTicketModalDataAction(id: string): Promise<ActionResult<TicketModalData>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  const [queueRow] = await sql<{ queue: string }[]>`SELECT queue FROM tickets WHERE id = ${id}`
  if (!queueRow) return { error: 'Ticket not found' }

  if (queueRow.queue === 'BILLING') {
    const billing = await getBillingTicketByIdAction(id)
    if (billing.error) return { error: billing.error }
    return { data: { kind: 'billing', data: billing.data! } }
  }

  const [ticket] = await sql<(Ticket & { customer_name: string | null; customer_phone: string | null; customer_email_onfile: string | null })[]>`
    SELECT t.*, cu.name AS customer_name, cu.phone AS customer_phone, cu.email AS customer_email_onfile
    FROM tickets t
    LEFT JOIN customers cu ON cu.id = t.customer_id
    WHERE t.id = ${id}
  `
  if (!ticket) return { error: 'Ticket not found' }
  // Mirrors app/(app)/tickets/t2/[id]/page.tsx's own agent-ownership gate.
  if (auth.role === 'agent' && ticket.created_by !== auth.userId && ticket.assigned_to !== auth.userId) {
    return { error: 'Forbidden' }
  }

  const [events, escalations, solutions, activeAssistance, activeAgents] = await Promise.all([
    sql<TicketEvent[]>`
      SELECT e.*, p.full_name AS user_name
      FROM ticket_events e
      LEFT JOIN profiles p ON p.id = e.user_id
      WHERE e.ticket_id = ${id}
      ORDER BY e.created_at ASC
    `,
    sql<TicketEscalation[]>`SELECT * FROM ticket_escalations WHERE ticket_id = ${id} ORDER BY created_at ASC`,
    sql<TicketSolution[]>`
      SELECT s.*, p.full_name AS agent_name
      FROM ticket_solutions s
      LEFT JOIN profiles p ON p.id = s.agent_id
      WHERE s.ticket_id = ${id}
      ORDER BY s.created_at ASC
    `,
    ticket.customer_id ? getActiveAssistanceForCustomer(ticket.customer_id) : Promise.resolve([]),
    // Reassign-callback picker's candidate list (TicketDetailView.tsx) — only
    // ever rendered for team_leader/management/hod, but cheap enough to fetch
    // unconditionally rather than branching this query on the viewer's role.
    sql<{ id: string; full_name: string }[]>`
      SELECT id, full_name FROM profiles WHERE role IN ('agent', 'team_leader') AND is_active = true ORDER BY full_name
    `,
  ])

  return {
    data: {
      kind: 't2',
      data: { ticket, events, escalations, solutions, activeAssistance, activeAgents, role: auth.role, t2Team: auth.t2Team },
    },
  }
}

// customer search — relocated to lib/customers/search.ts (Phase 2, shared
// by both T2 and Social sides of the unified page).

// ─── update diagnostics ─────────────────────────────────────────────────

export interface DiagnosticsInput {
  project: string | null
  root_cause: string | null
  rsrp: string | null
  rsrq: string | null
  sinr: string | null
  serving_site: string | null
  connected_site: string | null
  band: string | null
  network_technology: string | null
  download_speed: string | null
  upload_speed: string | null
  latency: string | null
}

export async function updateDiagnosticsAction(ticketId: string, input: DiagnosticsInput): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (!['agent', 'team_leader', 't3'].includes(auth.role)) return { error: 'Forbidden' }

  const ticket = await loadTicket(ticketId)
  if (!ticket) return { error: 'Ticket not found' }
  if (auth.role === 't3' && ticket.escalation_destination !== auth.t2Team) return { error: 'Ticket is not routed to your team' }
  if (!isOwnTicket(auth, ticket)) return { error: 'This ticket is not yours' }
  if (['resolved', 'closed'].includes(ticket.status)) {
    return { error: 'Ticket is already resolved — diagnostics can no longer be edited' }
  }

  try {
    await withTransaction(async (tx) => {
      if (auth.role !== 't3') await maybeStartProgress(tx as unknown as typeof sql, ticket)
      await tx`
        UPDATE tickets SET
          project = ${input.project}, root_cause = ${input.root_cause},
          rsrp = ${input.rsrp}, rsrq = ${input.rsrq}, sinr = ${input.sinr},
          serving_site = ${input.serving_site}, connected_site = ${input.connected_site}, band = ${input.band},
          network_technology = ${input.network_technology}, download_speed = ${input.download_speed},
          upload_speed = ${input.upload_speed}, latency = ${input.latency}
        WHERE id = ${ticketId}
      `
      await logEvent(tx as unknown as typeof sql, ticketId, auth.userId, 'note', 'Network diagnostics captured/updated')
    })
    return { data: true }
  } catch (error) {
    console.error('updateDiagnosticsAction failed', error)
    return { error: 'Could not update diagnostics.' }
  }
}

// ─── add note ────────────────────────────────────────────────────────────

export async function addTicketNoteAction(ticketId: string, note: string): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }

  const ticket = await loadTicket(ticketId)
  if (!ticket) return { error: 'Ticket not found' }
  if (!isOwnTicket(auth, ticket)) return { error: 'This ticket is not yours' }

  try {
    await withTransaction(async (tx) => {
      if (auth.role === 'agent' || auth.role === 'team_leader') await maybeStartProgress(tx as unknown as typeof sql, ticket)
      if (note) await logEvent(tx as unknown as typeof sql, ticketId, auth.userId, 'note', note)
    })
    return { data: true }
  } catch (error) {
    console.error('addTicketNoteAction failed', error)
    return { error: 'Could not add note.' }
  }
}

// ─── solve directly ─────────────────────────────────────────────────────

export interface SolveInput {
  troubleshooting_performed: string
  findings: string
  solution: string
  outcome: string
}

export async function solveTicketAction(ticketId: string, input: SolveInput): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (auth.role !== 'agent' && auth.role !== 'team_leader') return { error: 'Forbidden' }

  const ticket = await loadTicket(ticketId)
  if (!ticket) return { error: 'Ticket not found' }
  if (!isOwnTicket(auth, ticket)) return { error: 'This ticket is not yours' }
  if (!['open', 'in_progress', 'callback'].includes(ticket.status)) return { error: 'Ticket has already been escalated or resolved' }
  if (!input.troubleshooting_performed || !input.findings || !input.solution || !input.outcome) {
    return { error: 'Troubleshooting performed, findings, solution, and outcome are all required to resolve a ticket' }
  }
  if (!(SOLUTION_OUTCOMES as readonly string[]).includes(input.outcome)) {
    return { error: `outcome must be one of: ${SOLUTION_OUTCOMES.join(', ')}` }
  }

  try {
    await withTransaction(async (tx) => {
      const ts = nowIso()
      await tx`UPDATE tickets SET status = 'resolved', resolved_at = ${ts} WHERE id = ${ticketId}`
      await tx`
        INSERT INTO ticket_solutions (ticket_id, agent_id, troubleshooting_performed, findings, solution, outcome)
        VALUES (${ticketId}, ${auth.userId}, ${input.troubleshooting_performed}, ${input.findings}, ${input.solution}, ${input.outcome})
      `
      await logEvent(tx as unknown as typeof sql, ticketId, auth.userId, 'solution', `Resolved directly by ${auth.fullName} — pending Team Lead review`)
    })
    return { data: true }
  } catch (error) {
    console.error('solveTicketAction failed', error)
    return { error: 'Could not resolve ticket.' }
  }
}

// ─── escalate ────────────────────────────────────────────────────────────

export interface EscalateInput {
  escalate_to: string
  escalation_reason: string
  technical_findings: string | null
  troubleshooting_already_performed: string | null
  regular_site: string | null
  serving_site: string | null
  station_reference_ticket: string | null
  agent_notes: string | null
  priority: string
}

export async function escalateTicketAction(ticketId: string, input: EscalateInput): Promise<ActionResult<{ escalationId: string }>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (auth.role !== 'agent' && auth.role !== 'team_leader') return { error: 'Forbidden' }

  const ticket = await loadTicket(ticketId)
  if (!ticket) return { error: 'Ticket not found' }
  if (!isOwnTicket(auth, ticket)) return { error: 'This ticket is not yours' }
  if (!['open', 'in_progress', 'callback'].includes(ticket.status)) {
    return { error: 'This ticket already has an active escalation, or is resolved' }
  }
  if (!input.escalate_to || !input.escalation_reason) return { error: 'escalate_to and escalation_reason are required' }
  if (!T3_ESCALATION_TEAMS.includes(input.escalate_to)) return { error: `escalate_to must be one of: ${T3_ESCALATION_TEAMS.join(', ')}` }
  if (input.priority && !(PRIORITIES as readonly string[]).includes(input.priority)) {
    return { error: `priority must be one of: ${PRIORITIES.join(', ')}` }
  }

  try {
    const escalationId = await withTransaction(async (tx) => {
      await maybeStartProgress(tx as unknown as typeof sql, ticket)

      const [{ c }] = await tx<{ c: string }[]>`SELECT COUNT(*)::int AS c FROM ticket_escalations WHERE ticket_id = ${ticketId}`
      const attemptNumber = Number(c) + 1

      const rows = await tx<{ id: string }[]>`
        INSERT INTO ticket_escalations (
          ticket_id, escalate_to, escalation_reason, technical_findings, troubleshooting_already_performed,
          regular_site, serving_site, station_reference_ticket, agent_notes, priority, created_by
        ) VALUES (
          ${ticketId}, ${input.escalate_to}, ${input.escalation_reason}, ${input.technical_findings},
          ${input.troubleshooting_already_performed}, ${input.regular_site}, ${input.serving_site},
          ${input.station_reference_ticket}, ${input.agent_notes}, ${input.priority || 'medium'}, ${auth.userId}
        )
        RETURNING id
      `
      const escalation = rows[0]
      const ts = nowIso()
      await tx`UPDATE tickets SET status = 'escalated', escalation_destination = ${input.escalate_to}, routed_at = ${ts} WHERE id = ${ticketId}`
      await logEvent(
        tx as unknown as typeof sql, ticketId, auth.userId, 'escalated',
        `Escalated to ${input.escalate_to}${attemptNumber > 1 ? ` (attempt #${attemptNumber})` : ''}: ${input.escalation_reason}`
      )
      return escalation.id
    })
    return { data: { escalationId } }
  } catch (error) {
    console.error('escalateTicketAction failed', error)
    return { error: 'Could not escalate ticket.' }
  }
}

// ─── T3 acknowledge / respond, T2 validate ─────────────────────────────

interface EscalationGate {
  id: string
  ticket_id: string
  escalate_to: string
  status: string
  t3_response: string | null
}

async function loadOwnedEscalation(ticketId: string, escId: string, t2Team: string | null): Promise<EscalationGate | { error: string }> {
  const rows = await sql<EscalationGate[]>`
    SELECT id, ticket_id, escalate_to, status, t3_response FROM ticket_escalations WHERE id = ${escId} AND ticket_id = ${ticketId}
  `
  const escalation = rows[0]
  if (!escalation) return { error: 'Escalation not found' }
  if (escalation.escalate_to !== t2Team) return { error: 'This escalation is not routed to your team' }
  return escalation
}

export async function acknowledgeEscalationAction(ticketId: string, escId: string): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (auth.role !== 't3') return { error: 'Forbidden' }

  const escalation = await loadOwnedEscalation(ticketId, escId, auth.t2Team)
  if ('error' in escalation) return escalation
  if (escalation.status !== 'open') return { error: `Escalation is already ${escalation.status}` }

  try {
    await withTransaction(async (tx) => {
      const ts = nowIso()
      await tx`
        UPDATE ticket_escalations SET status = 'acknowledged', t3_acknowledged_by = ${auth.userId}, t3_acknowledged_at = ${ts}
        WHERE id = ${escId}
      `
      await tx`UPDATE tickets SET status = 'awaiting_t3', acknowledged_at = COALESCE(acknowledged_at, ${ts}) WHERE id = ${ticketId}`
      await logEvent(tx as unknown as typeof sql, ticketId, auth.userId, 'acknowledged', `${auth.t2Team} acknowledged the escalation`)
    })
    return { data: true }
  } catch (error) {
    console.error('acknowledgeEscalationAction failed', error)
    return { error: 'Could not acknowledge escalation.' }
  }
}

export async function respondEscalationAction(ticketId: string, escId: string, response: string): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (auth.role !== 't3') return { error: 'Forbidden' }

  const escalation = await loadOwnedEscalation(ticketId, escId, auth.t2Team)
  if ('error' in escalation) return escalation
  if (escalation.status !== 'acknowledged') return { error: 'Acknowledge the escalation before submitting a response' }
  if (!response) return { error: 'response is required' }

  try {
    await withTransaction(async (tx) => {
      const ts = nowIso()
      await tx`
        UPDATE ticket_escalations SET status = 'responded', t3_response = ${response}, t3_response_by = ${auth.userId}, t3_response_at = ${ts}
        WHERE id = ${escId}
      `
      await tx`UPDATE tickets SET status = 't3_responded' WHERE id = ${ticketId}`
      await logEvent(tx as unknown as typeof sql, ticketId, auth.userId, 'note', `${auth.t2Team} response: ${response}`)
    })
    return { data: true }
  } catch (error) {
    console.error('respondEscalationAction failed', error)
    return { error: 'Could not submit response.' }
  }
}

export interface ValidateInput {
  result: 'resolved' | 'rejected'
  note?: string
  troubleshooting_performed?: string
  findings?: string
  outcome?: string
  solution?: string
}

export async function validateEscalationAction(ticketId: string, escId: string, input: ValidateInput): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (auth.role !== 'agent' && auth.role !== 'team_leader') return { error: 'Forbidden' }

  const ticket = await loadTicket(ticketId)
  if (!ticket) return { error: 'Ticket not found' }
  if (!isOwnTicket(auth, ticket)) return { error: 'This ticket is not yours' }

  const rows = await sql<EscalationGate[]>`
    SELECT id, ticket_id, escalate_to, status, t3_response FROM ticket_escalations WHERE id = ${escId} AND ticket_id = ${ticketId}
  `
  const escalation = rows[0]
  if (!escalation) return { error: 'Escalation not found' }
  if (escalation.status !== 'responded') return { error: 'This escalation has no T3 response to validate yet' }
  if (!['resolved', 'rejected'].includes(input.result)) return { error: "result must be 'resolved' or 'rejected'" }

  try {
    const ts = nowIso()

    if (input.result === 'rejected') {
      await withTransaction(async (tx) => {
        await tx`
          UPDATE ticket_escalations
          SET status = 'rejected', t2_validation_result = 'rejected', t2_validated_by = ${auth.userId}, t2_validated_at = ${ts}, t2_validation_note = ${input.note ?? null}
          WHERE id = ${escId}
        `
        await tx`UPDATE tickets SET status = 'in_progress' WHERE id = ${ticketId}`
        await logEvent(
          tx as unknown as typeof sql, ticketId, auth.userId, 'status_change',
          `T2 validation: did not resolve the issue${input.note ? ` — ${input.note}` : ''}`
        )
      })
      return { data: true }
    }

    const finalOutcome = input.outcome || 'resolved'
    const finalSolution = input.solution || escalation.t3_response
    const troubleshootingPerformed = input.troubleshooting_performed
    const findings = input.findings
    if (!troubleshootingPerformed || !findings || !finalSolution) {
      return { error: 'Troubleshooting performed, findings, and a solution (or the T3 response) are required to validate a resolution' }
    }
    if (!(SOLUTION_OUTCOMES as readonly string[]).includes(finalOutcome)) {
      return { error: `outcome must be one of: ${SOLUTION_OUTCOMES.join(', ')}` }
    }

    await withTransaction(async (tx) => {
      await tx`
        UPDATE ticket_escalations
        SET status = 'validated', t2_validation_result = 'resolved', t2_validated_by = ${auth.userId}, t2_validated_at = ${ts}, t2_validation_note = ${input.note ?? null}
        WHERE id = ${escId}
      `
      await tx`UPDATE tickets SET status = 'resolved', resolved_at = ${ts} WHERE id = ${ticketId}`
      await tx`
        INSERT INTO ticket_solutions (ticket_id, agent_id, troubleshooting_performed, findings, solution, outcome, escalation_id)
        VALUES (${ticketId}, ${auth.userId}, ${troubleshootingPerformed}, ${findings}, ${finalSolution}, ${finalOutcome}, ${escId})
      `
      await logEvent(tx as unknown as typeof sql, ticketId, auth.userId, 'solution', 'T2 Agent validated the solution — pending Team Lead review')
      await logEvent(tx as unknown as typeof sql, ticketId, auth.userId, 'resolved', 'Ticket resolved')
    })
    return { data: true }
  } catch (error) {
    console.error('validateEscalationAction failed', error)
    return { error: 'Could not validate escalation.' }
  }
}

// ─── callbacks ───────────────────────────────────────────────────────────
//
// The outcome that used to create these (both at ticket creation and via
// the detail page's "Call back requested" outcome) has been removed — the
// Tickets page's standalone Callback toolbar button covers that need now.
// tickets.status = 'callback', callback_scheduled_at/callback_notes, and
// this reassign action are all kept so any ticket that already reached
// that status (before the outcome was removed) still displays and can
// still be actioned/reassigned normally — nothing here creates a NEW one.

/** Team-leader-tier takeover: hands a callback-status ticket to a different active agent or team leader. */
export async function reassignCallbackTicketAction(ticketId: string, agentId: string): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (auth.role !== 'team_leader' && auth.role !== 'management' && auth.role !== 'hod') return { error: 'Forbidden' }
  if (!agentId) return { error: 'agent_id is required' }

  const ticket = await loadTicket(ticketId)
  if (!ticket) return { error: 'Ticket not found' }
  if (ticket.status !== 'callback') return { error: 'Only a callback-status ticket can be reassigned this way' }

  const agentRows = await sql<{ id: string; full_name: string; role: Role }[]>`
    SELECT id, full_name, role FROM profiles WHERE id = ${agentId} AND is_active = true
  `
  const agent = agentRows[0]
  if (!agent || (agent.role !== 'agent' && agent.role !== 'team_leader')) return { error: 'Agent not found' }

  try {
    await withTransaction(async (tx) => {
      await tx`UPDATE tickets SET assigned_to = ${agentId} WHERE id = ${ticketId}`
      await logEvent(tx as unknown as typeof sql, ticketId, auth.userId, 'note', `Callback ticket reassigned to ${agent.full_name}`)
    })
    return { data: true }
  } catch (error) {
    console.error('reassignCallbackTicketAction failed', error)
    return { error: 'Could not reassign ticket.' }
  }
}

// ─── solution review (Team Lead) ───────────────────────────────────────

export interface ReviewInput {
  action: 'approve' | 'edit' | 'reject'
  edited_solution?: string
  note?: string
}

export async function reviewSolutionAction(ticketId: string, input: ReviewInput): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (auth.role !== 'team_leader') return { error: 'Forbidden' }
  if (!['approve', 'edit', 'reject'].includes(input.action)) return { error: 'action must be one of: approve, edit, reject' }
  if (input.action === 'edit' && !input.edited_solution) return { error: 'edited_solution is required for action=edit' }

  const ticketRows = await sql<{
    id: string; issue_type: string; description: string | null; root_cause: string | null
    rsrp: string | null; rsrq: string | null; sinr: string | null; regular_site: string | null; queue: string
  }[]>`SELECT id, issue_type, description, root_cause, rsrp, rsrq, sinr, regular_site, queue FROM tickets WHERE id = ${ticketId}`
  const ticket = ticketRows[0]
  if (!ticket) return { error: 'Ticket not found' }

  const pendingRows = await sql<{
    id: string; solution: string | null; troubleshooting_performed: string | null; outcome: string | null
    review_status: string; escalation_id: string | null
  }[]>`SELECT * FROM ticket_solutions WHERE ticket_id = ${ticketId} ORDER BY created_at DESC LIMIT 1`
  const pending = pendingRows[0]
  if (!pending) return { error: 'No solution has been submitted for this ticket yet' }
  if (pending.review_status !== 'pending') return { error: `This solution was already ${pending.review_status}` }

  const reviewStatus = input.action === 'approve' ? 'approved' : input.action === 'edit' ? 'edited' : 'rejected'
  const approvedSolution = input.action === 'edit' ? input.edited_solution! : pending.solution

  try {
    await withTransaction(async (tx) => {
      const ts = nowIso()
      await tx`
        UPDATE ticket_solutions
        SET review_status = ${reviewStatus}, approved_solution = ${input.action === 'reject' ? null : approvedSolution},
            reviewed_by = ${auth.userId}, reviewed_at = ${ts}, review_note = ${input.note ?? null}
        WHERE id = ${pending.id}
      `

      if (input.action !== 'reject') {
        const escalation = pending.escalation_id
          ? (await tx<{ escalation_reason: string; escalate_to: string; t3_response: string | null }[]>`
              SELECT escalation_reason, escalate_to, t3_response FROM ticket_escalations WHERE id = ${pending.escalation_id}
            `)[0]
          : null

        await tx`
          INSERT INTO ai_knowledge (
            ticket_id, ticket_solution_id, problem, symptoms, root_cause, rsrp, rsrq, sinr, regular_site, queue,
            troubleshooting, solution, result, escalation_reason, t3_team, t3_findings
          ) VALUES (
            ${ticket.id}, ${pending.id}, ${ticket.issue_type}, ${ticket.description}, ${ticket.root_cause},
            ${ticket.rsrp}, ${ticket.rsrq}, ${ticket.sinr}, ${ticket.regular_site}, ${ticket.queue},
            ${pending.troubleshooting_performed}, ${approvedSolution}, ${pending.outcome},
            ${escalation?.escalation_reason ?? null}, ${escalation?.escalate_to ?? null}, ${escalation?.t3_response ?? null}
          )
        `
      }

      await logEvent(tx as unknown as typeof sql, ticket.id, auth.userId, 'review', `Solution ${reviewStatus}${input.note ? ` — ${input.note}` : ''}`)
    })
    return { data: true }
  } catch (error) {
    console.error('reviewSolutionAction failed', error)
    return { error: 'Could not review solution.' }
  }
}

// ─── close ───────────────────────────────────────────────────────────────

export async function closeTicketAction(ticketId: string, closingNote: string | null): Promise<ActionResult<true>> {
  const auth = await requireUser()
  if ('error' in auth) return { error: auth.error }
  if (auth.role !== 'agent' && auth.role !== 'team_leader') return { error: 'Forbidden' }

  const ticket = await loadTicket(ticketId)
  if (!ticket) return { error: 'Ticket not found' }
  if (!isOwnTicket(auth, ticket)) return { error: 'This ticket is not yours' }
  if (ticket.status !== 'resolved') return { error: 'Ticket must be resolved before it can be closed' }

  try {
    await withTransaction(async (tx) => {
      const ts = nowIso()
      await tx`UPDATE tickets SET status = 'closed', closed_at = ${ts} WHERE id = ${ticketId}`
      await logEvent(tx as unknown as typeof sql, ticketId, auth.userId, 'closed', closingNote || 'Customer updated and ticket closed')
    })
    return { data: true }
  } catch (error) {
    console.error('closeTicketAction failed', error)
    return { error: 'Could not close ticket.' }
  }
}

// queue assignment (team-lead-assigns-others), self-service "my current
// queue", and queue-reassignment history — relocated to lib/queues/actions.ts
// (Phase 2), now that "current queue" spans both T2 and Social queues
// instead of being T2-only.
