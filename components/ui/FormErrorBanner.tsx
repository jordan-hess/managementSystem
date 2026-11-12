/** General (non-field) form error — failed saves, server errors with no field attached. `tone="dark"` is for panels hard-coded dark in both themes. */
export default function FormErrorBanner({ message, tone }: { message?: string; tone?: 'dark' }) {
  if (!message) return null
  const colors = tone === 'dark'
    ? 'bg-red-950/20 border border-red-900/40 text-red-400'
    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'
  return (
    <div role="alert" className={`mb-4 p-3 rounded-lg text-sm ${colors}`}>
      {message}
    </div>
  )
}
