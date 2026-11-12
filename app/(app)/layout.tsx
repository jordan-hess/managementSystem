import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { recordDailyActivity } from '@/lib/auth/recordDailyActivity'
import { isSubmitterTeamLeader } from '@/lib/auth/authz'
import { DEFAULT_DEMO_ROLE, getDemoRole } from '@/lib/auth/demoRole'
import Sidebar from '@/components/layout/Sidebar'
import RoleSwitcher from '@/components/layout/RoleSwitcher'
import { NotificationsProvider } from '@/components/layout/NotificationsProvider'
import { Profile } from '@/types'

const GUEST_PROFILE: Profile = {
  id: '',
  email: 'guest@example.com',
  full_name: 'Guest',
  role: 'admin',
  department: null,
  avatar_url: null,
  is_active: true,
  force_password_change: false,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  t2_team: null,
  username: null,
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getCurrentUserId()

  // Records this user's first activity of the business day (once — see
  // recordDailyActivity's own comment for why this lives here rather than
  // in the credentials sign-in check). Every authenticated page renders
  // through this layout, so it's the one place guaranteed to catch it.
  if (userId) await recordDailyActivity(userId)

  const profileRows = userId
    ? await sql<Profile[]>`
        SELECT id, email, full_name, role, department, avatar_url, is_active, force_password_change, created_at, updated_at, t2_team, username
        FROM profiles WHERE id = ${userId}
      `
    : []

  // No auth in this copy: the role-select modal picks a seeded profile to
  // act as (lib/auth/demoRole.ts). If that role has no profile in the local
  // database, render as a guest carrying the picked role.
  const demoRole = await getDemoRole()
  const profile: Profile = profileRows[0] ?? { ...GUEST_PROFILE, role: demoRole ?? DEFAULT_DEMO_ROLE }

  // Distinguishes a real team leader (every one on SIT is role='admin' with
  // a team_leaders row — see CLAUDE.md and lib/leadops/permissions.ts) from
  // an admin who merely shares that role value, so Sidebar can hide the
  // leadOps link from a plain admin — Data Entry/Performance Reviews are
  // private per team leader, and a plain admin has nothing there to view.
  // One indexed single-row lookup, same helper /team-leaders and /roster
  // already use elsewhere.
  const hasTeamRow = userId ? await isSubmitterTeamLeader(userId) : false

  return (
    <NotificationsProvider userId={profile.id} userRole={profile.role}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
        <Sidebar
          profile={profile}
          hasTeamRow={hasTeamRow}
          roleSwitcher={<RoleSwitcher currentRole={demoRole} missingProfile={!userId} />}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto flex flex-col">
            {children}
          </main>
        </div>
      </div>
    </NotificationsProvider>
  )
}
