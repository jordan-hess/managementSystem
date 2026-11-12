/** Swaps an input class string's neutral border/focus ring for red when the field has an error. */
export function fieldInputClass(base: string, hasError: boolean): string {
  if (!hasError) return base
  const swapped = base
    .replace(/\bdark:border-gray-(?:300|600|700)\b/, 'dark:border-red-500')
    .replace(/\bborder-gray-(?:300|600|700)\b/, 'border-red-500')
    .replace(/\bfocus:ring-blue-500\b/, 'focus:ring-red-500')
  return swapped.includes('border-red-500') ? swapped : `${swapped} border border-red-500 focus:ring-red-500`
}

export function fieldA11y(id: string, message: string | undefined): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  return message ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {}
}
