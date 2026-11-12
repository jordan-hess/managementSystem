// T2 Queue Hub merge — shared row types for the ported ticket domain.
// Mirrors t2-tickets-schema.sql column-for-column.

export type TicketStatus =
  | 'open' | 'in_progress' | 'escalated' | 'awaiting_t3' | 't3_responded' | 'resolved' | 'closed' | 'callback'

export type EscalationStatus = 'open' | 'acknowledged' | 'responded' | 'validated' | 'rejected'
export type EscalationPriority = 'low' | 'medium' | 'high' | 'critical'

export interface Ticket {
  id: string
  legacy_id: number | null
  ticket_number: string
  customer_id: string | null
  queue: string
  issue_type: string
  description: string | null
  address: string | null
  plus_code: string | null
  imsi: string | null
  msisdn: string | null
  customer_email: string | null
  regular_site: string | null
  provisioning_status: string | null
  escalation_destination: string | null
  status: TicketStatus
  created_by: string | null
  assigned_to: string | null
  created_at: string
  routed_at: string | null
  acknowledged_at: string | null
  resolved_at: string | null
  closed_at: string | null
  rsrp: string | null
  rsrq: string | null
  sinr: string | null
  project: string | null
  root_cause: string | null
  serving_site: string | null
  connected_site: string | null
  band: string | null
  network_technology: string | null
  download_speed: string | null
  upload_speed: string | null
  latency: string | null
  // Advanced queue's device type field.
  device: string | null
  // Advanced queue's escalation-path classification, captured at intake —
  // distinct from ticket_escalations.escalate_to (the real T3 destination).
  escalation_path: string | null
  // Informational "how did this end" field, captured at creation time for
  // every queue (fixed dropdown for Advanced, free text for SIM SWAP/MNP) —
  // does not itself drive the ticket's real status; see actions.ts.
  outcome: string | null
  // Set by scheduleCallbackAction when status becomes 'callback' — mirrors
  // support_tickets.callback_scheduled_at/callback_notes (see types/index.ts),
  // but kept as TEXT (not timestamptz) since it's stored verbatim from a
  // timezone-less <input type="datetime-local"> value.
  callback_scheduled_at: string | null
  callback_notes: string | null
  // SIM SWAP queue's own field set (t2-tickets-queue-specific-fields.sql) —
  // null for every other queue's tickets.
  sim_type: string | null
  swap_reason: string | null
  swap_requested_date: string | null
  swap_processed: string | null
  station_ticket_number: string | null
  // MNP (Porting) queue's own field set (t2-tickets-mnp-and-outcome.sql) —
  // null for every other queue's tickets.
  port_in: string | null
  port_customer_experiencing_issues: string | null
  port_issue_type: string | null
  port_inquiry_type: string | null
  port_reversal_reason: string | null
  donor_isp: string | null
  // BILLING queue's own field set (Database/migrations/billing-queue.sql) —
  // null for every other queue's tickets. `amount` comes back as a string
  // from the `postgres` driver's numeric serialization (avoids float
  // precision loss), not a number.
  channel: string | null
  amount: string | null
}

export interface TicketWithNames extends Ticket {
  created_by_name: string | null
  assigned_to_name: string | null
  customer_name: string | null
  customer_phone: string | null
}

export interface TicketEscalation {
  id: string
  ticket_id: string
  escalate_to: string
  escalation_reason: string
  technical_findings: string | null
  troubleshooting_already_performed: string | null
  regular_site: string | null
  serving_site: string | null
  station_reference_ticket: string | null
  agent_notes: string | null
  priority: EscalationPriority
  status: EscalationStatus
  created_by: string | null
  created_at: string
  t3_acknowledged_by: string | null
  t3_acknowledged_at: string | null
  t3_response: string | null
  t3_response_by: string | null
  t3_response_at: string | null
  t2_validation_result: 'resolved' | 'rejected' | null
  t2_validated_by: string | null
  t2_validated_at: string | null
  t2_validation_note: string | null
}

export interface TicketEvent {
  id: string
  ticket_id: string
  user_id: string | null
  user_name: string | null
  event_type: string
  note: string | null
  created_at: string
}

export interface TicketSolution {
  id: string
  ticket_id: string
  agent_id: string | null
  agent_name: string | null
  troubleshooting_performed: string | null
  findings: string | null
  solution: string | null
  outcome: string | null
  review_status: 'pending' | 'approved' | 'edited' | 'rejected'
  approved_solution: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  escalation_id: string | null
  created_at: string
}
