import { redirect } from 'next/navigation'
import Header from '@/components/layout/Header'
import LeadOpsWorkspace from '@/components/leadops/LeadOpsWorkspace'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { isSubmitterTeamLeader } from '@/lib/auth/authz'
import { leadOpsScope } from '@/lib/leadops/featureFlag'
import { todayInSouthAfrica } from '@/lib/leadops/periods'
import { sql } from '@/lib/db/pool'
import type { Role } from '@/types'

/**
 * leadOps — Phase 0 prototype, now with real role resolution.
 *
 * The one deliberate departure from Phase 0's "queries nothing" rule: Data
 * Entry's role matrix (Team Leader vs Admin vs Management vs HOD) needs the
 * viewer's actual role, so this runs the same one-line profiles lookup
 * every other opsHub page does (see app/(app)/qa-reviews/page.tsx) — not a
 * new authorization architecture, the existing one.
 *
 * "Team Leader" is not a role on SIT — every real team leader is
 * role = 'admin' with a team_leaders row (CLAUDE.md's own description of
 * the shape). isSubmitterTeamLeader (lib/auth/authz.ts) answers that
 * question with the same query team-leaders.ts and warnings already use;
 * this page resolves it ONCE, server-side, and passes a plain boolean down
 * — the "never re-derive role in the client" convention every opsHub page
 * follows (see components/layout/Sidebar.tsx's own comment on why it
 * re-implements role checks rather than importing this).
 *
 * No writes here, and no other table — mock data still backs every figure
 * the page renders.
 */
export default async function LeadOpsPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/home')

  const [profile] = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  const role = profile?.role ?? 'agent'
  const hasTeamRow = await isSubmitterTeamLeader(userId)

  // Same audience as the sidebar link (components/layout/Sidebar.tsx), enforced
  // here too so a direct visit to /leadops by anyone else doesn't render it.
  const allowed = role === 'hod' || role === 'management' || role === 'team_leader' || (role === 'admin' && hasTeamRow)
  if (!allowed) redirect('/home')

  return (
    <div className="flex-1 overflow-auto">
      <Header title="leadOps" userId={userId} userRole={role} />
      <div className="p-6 space-y-4">
        <LeadOpsWorkspace
          viewer={{ role, hasTeamRow, profileId: userId }}
          scope={leadOpsScope()}
          today={todayInSouthAfrica(new Date())}
          nowIso={new Date().toISOString()}
        />
      </div>
    </div>
  )
}
