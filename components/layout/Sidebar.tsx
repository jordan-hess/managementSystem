'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, LayoutDashboard, ShieldAlert, LogOut,
  CalendarDays, Inbox, Users2, ShieldCheck, Ticket, Gauge, type LucideIcon,
} from 'lucide-react'
import { clearDemoRole } from '@/app/(app)/demoRoleActions'
import { Profile } from '@/types'

// Mirrors lib/auth/authz.ts's isQaReviewer, inlined rather than imported —
// that module imports lib/db/pool (the `postgres` package, which needs
// Node's `net`/`tls` and can't bundle for the browser), so a 'use client'
// component importing even a pure function from it breaks the build. Same
// reasoning as lib/t2/constants.ts's split from lib/t2/queues.ts.
function isQaReviewer(role: Profile['role']): boolean {
  return role === 'qa_analyst' || role === 'team_leader' || role === 'admin' || role === 'management' || role === 'hod'
}

// Mirrors lib/auth/authz.ts's isTeamLeaderOrAbove, inlined for the same
// reason as isQaReviewer above (this file is 'use client', authz.ts is
// server-only).
function isTeamLeaderOrAbove(role: Profile['role']): boolean {
  return role === 'team_leader' || role === 'admin' || role === 'management' || role === 'hod'
}

interface SidebarProps {
  profile: Profile
  /** Role-select button + modal (no-login copy only); rendered above Sign out. */
  roleSwitcher?: React.ReactNode
  /**
   * Whether this profile has a `team_leaders` row — real team leaders on
   * SIT are all role='admin' with one, not role='team_leader' (see
   * lib/leadops/permissions.ts's isTeamLeader for the full reasoning).
   * Sidebar can't query team_leaders itself ('use client'), so
   * app/(app)/layout.tsx resolves it once via the existing
   * isSubmitterTeamLeader (lib/auth/authz.ts) and passes it down — same
   * never-query-from-the-client convention as everything else here.
   */
  hasTeamRow: boolean
}

// T2 Queue Hub merge: profiles migrated from T2 (t2_team set — see
// add-team-leader-and-t3-roles.sql) with role 'agent' are still confined to
// /tickets, /roster, /home (see proxy.ts's T2_AGENT_ALLOWED_PREFIXES) — but
// Phase 2's unified /tickets page dissolves the old separate-nav-array
// distinction: every role, restricted or not, now sees the same Tickets
// entry, since /tickets itself is the whole point of "no more separate T2
// vs Social surfaces."
function isRestrictedT2Agent(profile: Profile): boolean {
  return profile.role === 'agent' && !!profile.t2_team
}

function getPrimaryLinks(profile: Profile, hasTeamRow: boolean) {
  const { role } = profile

  if (isRestrictedT2Agent(profile)) {
    return [
      { href: '/home', label: 'Home', icon: Home },
      { href: '/tickets', label: 'Tickets', icon: Ticket },
      { href: '/roster', label: 'Team Roster', icon: CalendarDays },
    ]
  }

  const links = [
    { href: '/home', label: 'Home', icon: Home },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ]
  // Mirrors canAccessTeamManagement — qa_analyst is added page by page, not
  // to the whole team-leader tier.
  if (isTeamLeaderOrAbove(role) || role === 'qa_analyst') {
    links.push({ href: '/team-leaders', label: 'Team Management', icon: Users2 })
  }
  links.push(
    { href: '/tickets', label: 'Tickets', icon: Ticket },
  )
  // Mirrors canManageQueueAssignment.
  if (isTeamLeaderOrAbove(role) || role === 'qa_analyst') {
    links.push({ href: '/tickets/queue-assignment', label: 'Queue Assignment', icon: Users2 })
  }
  if (role !== 't3') {
    links.push({ href: '/roster', label: 'Team Roster', icon: CalendarDays })
  }
  // Non-T2 agents get their own read-only QA overview + warnings page.
  if (role === 'agent') {
    links.push({ href: '/qa', label: 'My QA', icon: ShieldCheck })
  }
  // Warnings management now lives inside the QA Reviews page itself
  // (folded in below its review list) — no separate nav entry needed.
  if (isQaReviewer(role)) {
    links.push({ href: '/qa-reviews', label: 'QA Reviews', icon: ShieldCheck })
  }
  // leadOps — leadership ops. HOD gets the full dashboard (Planner/Weekly
  // Log/Scorecard/Reviews); a real team leader and Management get Data Entry
  // plus their own/everyone's Performance Review (LeadOpsWorkspace.tsx
  // resolves which, from the real role — this is only the coarse "can this
  // account see the link at all" gate).
  //
  // A PLAIN ADMIN (role='admin', no team_leaders row) must NOT see this
  // link — Data Entry and Performance Reviews are private per team leader,
  // and an admin with no team has nothing there to view (see
  // lib/leadops/permissions.ts's canViewTeamLeaderData). role === 'admin'
  // alone is therefore not enough; hasTeamRow is what actually distinguishes
  // a real team leader (every one on SIT is admin+team_leaders) from an
  // admin who merely happens to share that role value. role === 'team_leader'
  // is included too, even though nothing on SIT has that value yet, for the
  // same reason lib/leadops/permissions.ts's isTeamLeader checks both shapes.
  //
  // This only hides the nav entry. The route and every leadOps server action
  // enforce the same audience themselves (app/(app)/leadops/page.tsx and
  // lib/leadops/serverGuard.ts), so a direct visit or call is refused too.
  if ((role === 'hod' || role === 'management' || role === 'team_leader' || (role === 'admin' && hasTeamRow))) {
    links.push({ href: '/leadops', label: 'leadOps', icon: Gauge })
  }
  return links
}

const adminLinks = [
  { href: '/admin',              label: 'Workflows', icon: ShieldAlert },
  { href: '/admin/requests',     label: 'Requests',  icon: Inbox       },
]

// Reused everywhere a label needs to disappear when the rail collapses: max-width (not
// width) is what's animatable for text with no intrinsic fixed width; opacity smooths the reveal.
const collapsibleText = 'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-in-out max-w-0 opacity-0 group-hover/rail:max-w-[10rem] group-hover/rail:opacity-100'

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      title={`Go to ${label}`}
      className={`flex items-center rounded-lg text-sm
        justify-center group-hover/rail:justify-start
        gap-0 group-hover/rail:gap-3 px-0 group-hover/rail:px-3 py-2
        transition-[gap,padding] duration-200 ease-in-out
        ${active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className={collapsibleText}>{label}</span>
    </Link>
  )
}

export default function Sidebar({ profile, hasTeamRow, roleSwitcher }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  // No auth in this copy: signing out forgets the picked role, which brings
  // the role-select modal back.
  async function handleLogout() {
    await clearDemoRole()
    router.push('/home')
    router.refresh()
  }

  return (
    <div className="group/rail flex flex-col h-full w-20 hover:w-64 shrink-0 overflow-hidden bg-gray-900 text-white transition-[width] duration-200 ease-in-out">
      <nav className="flex-1 flex flex-col justify-center gap-2 px-3 overflow-y-auto">
        {getPrimaryLinks(profile, hasTeamRow).map(({ href, label, icon }) => (
          <NavLink key={href} href={href} label={label} icon={icon} active={pathname === href} />
        ))}

        {profile.role === 'admin' && (
          <div className="mt-4 flex flex-col gap-2">
            <p className={`px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${collapsibleText}`}>Admin</p>
            {adminLinks.map(({ href, label, icon }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                icon={icon}
                active={pathname === href || pathname.startsWith(href + '/')}
              />
            ))}
          </div>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700 flex flex-col items-center gap-3 group-hover/rail:items-start">
        {roleSwitcher}
        {/* Self-contained hover: expands independently of the rail's own hover state
            (hovering it also bubbles up to the rail's :hover, so the rail expands too,
            giving the pill room to grow rather than being clipped by overflow-hidden). */}
        <button
          onClick={handleLogout}
          aria-label="Sign out"
          title="Sign out of your account"
          className="group/signout relative flex items-center justify-start w-11.25 h-11.25 shrink-0 rounded-full overflow-hidden bg-blue-500 shadow-[2px_2px_10px_rgba(0,0,0,0.2)] transition-all duration-300 hover:w-31.25 hover:rounded-[40px] active:translate-x-0.5 active:translate-y-0.5"
        >
          <span className="w-full flex items-center justify-center transition-all duration-300 group-hover/signout:w-[30%] group-hover/signout:pl-5">
            <LogOut className="w-4.25 h-4.25 text-white shrink-0" />
          </span>
          <span className="absolute right-0 w-0 opacity-0 text-white text-sm font-semibold whitespace-nowrap transition-all duration-300 group-hover/signout:w-[70%] group-hover/signout:opacity-100 group-hover/signout:pr-2.5">
            Sign out
          </span>
        </button>
      </div>
    </div>
  )
}
