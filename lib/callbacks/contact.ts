export interface CallbackContact { name: string | null; email: string | null; phone: string | null }
export type ContactErrorKey = 'contact_name' | 'contact_email' | 'contact_phone' | 'contact'
export type ContactResult =
  | { ok: true; value: CallbackContact }
  | { ok: false; errors: Partial<Record<ContactErrorKey, string>> }

const NAME_MAX = 120
const EMAIL_MAX = 254
const PHONE_MAX = 40
const PHONE_MIN_DIGITS = 7
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/**
 * Normalises and validates callback-only contact details. The same rules run in the
 * Schedule Callback modal and in the server action (never trust the client): trim every
 * field (blank becomes null), at least one of phone/email, light format checks, length caps
 * that match the database CHECK constraints in callbacks-contact-details-2026-10-12.sql.
 */
export function normalizeCallbackContact(input: { name?: string | null; email?: string | null; phone?: string | null }): ContactResult {
  const name = clean(input.name)
  const email = clean(input.email)
  const phone = clean(input.phone)
  const errors: Partial<Record<ContactErrorKey, string>> = {}

  if (name && name.length > NAME_MAX) errors.contact_name = `Name must be ${NAME_MAX} characters or fewer.`
  if (email && (email.length > EMAIL_MAX || !EMAIL_RE.test(email))) errors.contact_email = 'Enter a valid email address.'
  if (phone) {
    if (phone.length > PHONE_MAX) errors.contact_phone = `Contact number must be ${PHONE_MAX} characters or fewer.`
    else if (phone.replace(/\D/g, '').length < PHONE_MIN_DIGITS) errors.contact_phone = `Contact number must have at least ${PHONE_MIN_DIGITS} digits.`
  }
  if (!email && !phone) errors.contact = 'Enter a contact number or an email address.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name, email, phone } }
}

/** Label for notification text about a manual callback: the contact name only, never the phone or email. */
export function manualCallbackLabel(contactName: string | null | undefined): string {
  return clean(contactName) ?? 'a callback contact'
}
