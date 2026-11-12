/** `tone="dark"` is for panels hard-coded dark in both themes (e.g. the roster request forms), where the default red-600 is low-contrast. */
export default function FieldError({ id, message, tone }: { id: string; message?: string; tone?: 'dark' }) {
  if (!message) return null
  const color = tone === 'dark' ? 'text-red-400' : 'text-red-600 dark:text-red-400'
  return <p id={`${id}-error`} role="alert" className={`text-xs ${color} mt-1`}>{message}</p>
}
