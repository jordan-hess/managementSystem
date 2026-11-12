// leadOps is always on: there is no on/off flag any more. It used to be hidden
// behind LEADOPS_ENABLED while it was a Phase 0 prototype; the real-data parts
// now have server-side authorisation (serverGuard.ts), so who can see it is
// decided by role alone (the sidebar link, the /leadops page, and every server
// action each check it). Turning it off means reverting the code.
//
// What IS still configurable is which tabs are offered:

/**
 * Which leadOps tabs are offered. 'prod' (the default, so an environment that
 * sets nothing is safe) is only the parts backed by real tables — Manager
 * Scorecard and KPI Actuals. 'full' adds the remaining tabs; Performance
 * Reviews are real now, and only the TL Efficiency Scorecard is still
 * in-memory mock data. Set LEADOPS_MOCK_TABS=true on SIT to keep testing them.
 * Server-only: reads the actual process.env, so it never bundles into client JS.
 */
export type LeadOpsScope = 'full' | 'prod'

export function leadOpsScope(): LeadOpsScope {
  return process.env.LEADOPS_MOCK_TABS === 'true' ? 'full' : 'prod'
}
