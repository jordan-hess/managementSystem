import type { FieldErrors } from '@/lib/forms/useFormErrors'
import { normalizeCallbackContact } from '@/lib/callbacks/contact'

export type CallbackField =
  | 'agent' | 'customer' | 'queue' | 'scheduled_at' | 'query_description'
  | 'contact_name' | 'contact_email' | 'contact_phone' | 'contact'
export const CALLBACK_FIELDS: readonly CallbackField[] = [
  'agent', 'customer', 'queue', 'scheduled_at', 'query_description',
  'contact_name', 'contact_email', 'contact_phone', 'contact',
]

export type CallbackMode = 'existing' | 'details'

export function validateCallback(
  form: {
    agent_id: string; customer_id: string; queue: string; scheduled_at: string; query_description: string
    mode: CallbackMode; contact_name: string; contact_email: string; contact_phone: string
  },
): FieldErrors<CallbackField> {
  const e: FieldErrors<CallbackField> = {}
  if (form.mode === 'existing') {
    if (!form.customer_id) e.customer = 'Please select a customer.'
  } else {
    const parsed = normalizeCallbackContact({ name: form.contact_name, email: form.contact_email, phone: form.contact_phone })
    if (!parsed.ok) Object.assign(e, parsed.errors)
  }
  if (!form.queue) e.queue = 'Please select a queue/channel.'
  if (!form.scheduled_at || Number.isNaN(new Date(form.scheduled_at).getTime())) e.scheduled_at = 'Scheduled date and time is required.'
  if (!form.query_description.trim()) e.query_description = 'Query description is required.'
  return e
}
