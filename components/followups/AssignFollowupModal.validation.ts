import type { FieldErrors } from '@/lib/forms/useFormErrors'
import { isValidEmail } from '@/lib/forms/validators'

export type AssignFollowupField =
  | 'agent' | 'customer' | 'new_name' | 'new_phone' | 'new_email'
  | 'query_description' | 'category' | 'cancellation_reason'

export const ASSIGN_FOLLOWUP_FIELDS: readonly AssignFollowupField[] = [
  'agent', 'customer', 'new_name', 'new_phone', 'new_email',
  'query_description', 'category', 'cancellation_reason',
]

export interface AssignFollowupValues {
  agentId: string
  customerId: string
  isNewCustomer: boolean
  newCustomerName: string
  newCustomerPhone: string
  newCustomerEmail: string
  queryDescription: string
  categoryId: string
  cancellationReason: string
  isCancellation: boolean
  isEditing: boolean
}

export function validateAssignFollowup(v: AssignFollowupValues): FieldErrors<AssignFollowupField> {
  const e: FieldErrors<AssignFollowupField> = {}
  if (!v.customerId) e.customer = 'Please select or create a customer.'
  if (v.isNewCustomer) {
    if (!v.newCustomerName.trim()) e.new_name = 'Full name is required.'
    if (!v.newCustomerPhone.trim()) e.new_phone = 'Phone number is required.'
    if (!v.newCustomerEmail.trim()) e.new_email = 'Email is required.'
    else if (!isValidEmail(v.newCustomerEmail)) e.new_email = 'Enter a valid email address.'
  }
  if (!v.queryDescription.trim()) e.query_description = 'Query description is required.'
  if (!v.isEditing && !v.categoryId) e.category = 'Please select a category.'
  if (v.isCancellation && !v.cancellationReason.trim()) e.cancellation_reason = 'Please provide a reason for cancellation.'
  return e
}
