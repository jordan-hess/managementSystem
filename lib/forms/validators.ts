/** Loose email shape check (something@something.tld, no spaces) — stands in for the browser's type="email" check now that forms use noValidate. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
