import type { FieldErrors } from '@/lib/forms/useFormErrors'
import { ESCALATION_OTHER } from '@/lib/tickets/constants'

export type SupportTicketField =
  | 'customer' | 'agent' | 'query_description' | 'query_type' | 'issue_type'
  | 'escalation' | 'escalation_other'
  | 'followup_date' | 'followup_time' | 'followup_notes'
  | 'callback_date' | 'callback_time' | 'callback_notes'

export const SUPPORT_TICKET_FIELDS: readonly SupportTicketField[] = [
  'customer', 'agent', 'query_description', 'query_type', 'issue_type',
  'escalation', 'escalation_other',
  'followup_date', 'followup_time', 'followup_notes',
  'callback_date', 'callback_time', 'callback_notes',
]

export interface SupportTicketFormValues {
  customer_id: string
  agent_id: string
  query_description: string
  query_type: string
  status: string
  escalationChoice: string
  escalationOtherText: string
  followupNotes: string; followupDate: string; followupTime: string
  callbackNotes: string; callbackDate: string; callbackTime: string
  issueType: string
}

/** Mirrors validateStatusFields in app/(app)/support-tickets/actions.ts — same rules, client-side, one message per field. */
export function validateSupportTicket(form: SupportTicketFormValues): FieldErrors<SupportTicketField> {
  const e: FieldErrors<SupportTicketField> = {}
  if (!form.customer_id) e.customer = 'Please select a customer.'
  if (!form.query_description.trim()) e.query_description = 'Query description is required.'

  if (form.status === 'escalated') {
    if (!form.escalationChoice) e.escalation = 'Escalation destination is required.'
    else if (form.escalationChoice === ESCALATION_OTHER && !form.escalationOtherText.trim()) e.escalation_other = 'Please specify the escalation destination.'
  }
  if (form.status === 'follow_up') {
    if (!form.followupDate) e.followup_date = 'Follow-up date is required.'
    if (!form.followupTime) e.followup_time = 'Follow-up time is required.'
    if (!form.followupNotes.trim()) e.followup_notes = 'Follow-up notes are required.'
  }
  if (form.status === 'callback') {
    if (!form.callbackDate) e.callback_date = 'Callback date is required.'
    if (!form.callbackTime) e.callback_time = 'Callback time is required.'
    if (!form.callbackNotes.trim()) e.callback_notes = 'Callback notes are required.'
  }
  if (form.status === 'resolved' || form.status === 'closed') {
    // The issue-type input only exists once a query type is chosen, so ask for that first.
    if (!form.query_type) e.query_type = 'A query type is required to resolve this ticket.'
    else if (!form.issueType.trim()) e.issue_type = 'Issue type is required to resolve this ticket.'
  }
  return e
}
