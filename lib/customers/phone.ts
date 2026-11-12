// Customer phone numbers: digits only, with an optional single leading "+".
// Kept out of actions.ts ('use server' files may only export async functions)
// so client forms and server actions can share it.

export const PHONE_FORMAT_ERROR = 'Phone number must contain numbers only (a leading + is allowed).'

/** Strips everything except digits, keeping a "+" only if it is the first character. */
export function sanitizePhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  return value.startsWith('+') ? `+${digits}` : digits
}

/** True for an optional leading "+" followed by at least one digit and nothing else. */
export function isValidPhone(value: string): boolean {
  return /^\+?\d+$/.test(value)
}
