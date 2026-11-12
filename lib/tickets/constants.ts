// Social ticket status control's escalation destinations — deliberately a
// separate, smaller list from T2's own T3_ESCALATION_TEAMS
// (lib/t2/constants.ts): Social escalation is a lighter "who does this go
// to" note, not T2's full acknowledge/respond/validate T3 workflow.
export const SUPPORT_TICKET_ESCALATION_DESTINATIONS = ['Marketing', 'Billing Ops', 'NPO', 'ISOC', 'CORE'] as const
export const ESCALATION_OTHER = 'Other'

// Query type dropdown for Social agents — shared by the "Add Ticket" modal
// (SupportTicketModal's new query_type field) and the QA Review form's
// Social Media "Query" field (lib/qa/constants.ts), same list both places.
export const SOCIAL_QUERY_TYPES = [
  'Billing',
  'Network',
  'Cancelation',
  'Logistics',
  'SIM Swap',
  'Porting',
  'Mobile Voice SIM Cards',
] as const

// Issue Type / Root Cause options, scoped to the ticket's Query — captured
// at resolution time (see SupportTicketModal's resolved-status block), and
// deliberately different per query so e.g. a Network query never offers a
// billing-shaped Issue Type. Keys must match SOCIAL_QUERY_TYPES exactly.
export const SOCIAL_ISSUE_TYPES_BY_QUERY_TYPE: Record<(typeof SOCIAL_QUERY_TYPES)[number], readonly string[]> = {
  Billing: ['Billing Dispute', 'Overcharge / Incorrect Amount', 'Failed Payment', 'Refund Request', 'Invoice / Statement Query', 'Debit Order Issue', 'Other'],
  Network: ['Service Outage / Network Issue', 'Slow Speed', 'Intermittent Connection', 'No Connectivity', 'Coverage Complaint', 'Other'],
  Cancelation: ['Cancellation Request', 'Retention / Save Attempt', 'Contract / Early Termination Dispute', 'Cancellation Not Processed', 'Other'],
  Logistics: ['Delayed Delivery', 'Lost / Missing Item', 'Wrong Item Delivered', 'Return / Collection Request', 'Damaged Item on Arrival', 'Other'],
  'SIM Swap': ['SIM Swap Request', 'SIM Not Activating After Swap', 'SIM Swap Fraud Concern', 'Duplicate / Failed SIM Swap', 'Other'],
  Porting: ['Port Delayed', 'Port Rejected', 'Port Not Initiated', 'Number Ported Incorrectly', 'Other'],
  'Mobile Voice SIM Cards': ['Voice SIM Activation Issue', 'Voice Service Not Working', 'Voice SIM Not Received', 'Account / SIM Management', 'Other'],
}

export const SOCIAL_ROOT_CAUSES_BY_QUERY_TYPE: Record<(typeof SOCIAL_QUERY_TYPES)[number], readonly string[]> = {
  Billing: ['Billing System Error', 'Customer Error', 'Incorrect Information Given to Customer', 'Internal Process Delay', 'No Fault Found', 'Other'],
  Network: ['Network Fault', 'Device Fault', 'System / Portal Fault', 'No Fault Found', 'Customer Error', 'Other'],
  Cancelation: ['Customer Error', 'Billing System Error', 'Internal Process Delay', 'Incorrect Information Given to Customer', 'No Fault Found', 'Other'],
  Logistics: ['Courier / Logistics Delay', 'System / Portal Fault', 'Customer Error', 'Internal Process Delay', 'No Fault Found', 'Other'],
  'SIM Swap': ['System / Portal Fault', 'Customer Error', 'Device Fault', 'Internal Process Delay', 'No Fault Found', 'Other'],
  Porting: ['Donor Network Issue (Porting)', 'System / Portal Fault', 'Customer Error', 'Internal Process Delay', 'No Fault Found', 'Other'],
  'Mobile Voice SIM Cards': ['Device Fault', 'System / Portal Fault', 'Network Fault', 'Customer Error', 'No Fault Found', 'Other'],
}
