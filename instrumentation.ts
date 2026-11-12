// In this copy the sweep runs against the local in-memory database
// (lib/db/local/), and the first tick is what builds it if no request has.
//
// Next.js instrumentation hook — register() runs once per server process at
// boot (stable since Next 15, no config flag needed). Used here to start the
// callback-reminder sweep: this app has no cron/scheduled-job infrastructure
// (see lib/agentStatus/actions.ts's own note on this same gap), and is
// deployed as a long-running Kubernetes pod running `node server.js`, not a
// serverless/per-request platform — so an in-process interval is viable here
// in a way it wouldn't be on Vercel.
//
// send_callback_reminders() already exists in the live DB (from a pre-migration
// Supabase-era design that intended pg_cron to call it — pg_cron was never
// enabled on the self-managed cluster this app now runs against, so the
// function has sat unused). It atomically claims due callbacks via
// `UPDATE ... SET reminder_sent = TRUE WHERE reminder_sent = FALSE ... RETURNING`,
// which makes it safe to call concurrently from every pod's own interval —
// only one caller can claim a given callback row, so reminders can't double-fire
// even with multiple replicas each running this loop.

declare global {
  // eslint-disable-next-line no-var
  var __callbackReminderIntervalStarted: boolean | undefined
}

const CHECK_INTERVAL_MS = 60_000

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Guard against next dev's HMR re-running register() and stacking up
  // duplicate intervals in the same process — same pattern as lib/db/pool.ts's
  // globalThis-cached pool.
  if (globalThis.__callbackReminderIntervalStarted) return
  globalThis.__callbackReminderIntervalStarted = true

  const { sql } = await import('@/lib/db/pool')

  setInterval(async () => {
    try {
      await sql`SELECT send_callback_reminders()`
    } catch (error) {
      console.error('send_callback_reminders sweep failed', error)
    }
  }, CHECK_INTERVAL_MS)
}
