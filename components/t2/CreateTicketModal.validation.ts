import type { FieldErrors } from '@/lib/forms/useFormErrors'
import type { CreateTicketInput } from '@/app/(app)/t2/actions'

export type CreateTicketField =
  | 'customer' | 'queue' | 'sim_type' | 'swap_reason' | 'swap_requested_date'
  | 'port_in' | 'port_customer_experiencing_issues' | 'port_inquiry_type'
  | 'port_issue_type' | 'port_reversal_reason'
  | 'issue_type' | 'new_name' | 'new_phone' | 'new_email'

export const CREATE_TICKET_FIELDS: readonly CreateTicketField[] = [
  'customer', 'queue', 'sim_type', 'swap_reason', 'swap_requested_date',
  'port_in', 'port_customer_experiencing_issues', 'port_inquiry_type',
  'port_issue_type', 'port_reversal_reason',
  'issue_type', 'new_name', 'new_phone', 'new_email',
]

export function validateCreateTicket(
  form: CreateTicketInput,
  ctx: { isSimSwap: boolean; isMnp: boolean; isGeneric: boolean },
): FieldErrors<CreateTicketField> {
  const e: FieldErrors<CreateTicketField> = {}
  if (!form.customer_id) e.customer = 'Please select a customer.'
  if (!form.queue) e.queue = 'Queue is required.'
  if (ctx.isSimSwap) {
    if (!form.sim_type) e.sim_type = 'SIM type is required.'
    if (!form.swap_reason) e.swap_reason = 'Reason is required.'
    if (!form.swap_requested_date) e.swap_requested_date = 'Requested date is required.'
  }
  if (ctx.isMnp) {
    if (!form.port_in) e.port_in = 'Please answer whether this is a port-in request.'
    else if (form.port_in === 'Yes') {
      if (!form.port_customer_experiencing_issues) e.port_customer_experiencing_issues = 'Please answer whether the customer is experiencing issues.'
      else if (form.port_customer_experiencing_issues === 'Yes' && !form.port_issue_type) e.port_issue_type = 'Please select what the issue is.'
    } else if (form.port_in === 'No') {
      if (!form.port_inquiry_type) e.port_inquiry_type = 'Please select what the inquiry relates to.'
      else if (form.port_inquiry_type === 'Port reversal' && !form.port_reversal_reason) e.port_reversal_reason = 'Please select the reason for the reversal.'
    }
  }
  if (ctx.isGeneric && !form.issue_type) e.issue_type = 'Issue type is required.'
  return e
}
