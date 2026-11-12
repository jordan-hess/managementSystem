import type { FieldErrors } from '@/lib/forms/useFormErrors'

export type FollowupField = 'customer' | 'queue' | 'query_description' | 'category' | 'cancellation_reason'
export const FOLLOWUP_FIELDS: readonly FollowupField[] = ['customer', 'queue', 'query_description', 'category', 'cancellation_reason']

export function validateFollowup(
  form: { customer_id: string; queue: string; query_description: string; category_id: string; cancellation_reason: string },
  ctx: { isEditing: boolean; isCancellation: boolean },
): FieldErrors<FollowupField> {
  const e: FieldErrors<FollowupField> = {}
  if (!form.customer_id) e.customer = 'Please select a customer.'
  if (!form.queue) e.queue = 'Please select a queue/channel.'
  if (!form.query_description.trim()) e.query_description = 'Query description is required.'
  if (!ctx.isEditing && !form.category_id) e.category = 'Please select a category.'
  if (ctx.isCancellation && !form.cancellation_reason.trim()) e.cancellation_reason = 'Please provide a reason for cancellation.'
  return e
}
