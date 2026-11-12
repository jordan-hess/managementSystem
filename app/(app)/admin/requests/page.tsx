import { sql } from '@/lib/db/pool'
import { queryRequestsWithDetail } from '@/lib/db/requestsQuery'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { redirect } from 'next/navigation'
import Header from '@/components/layout/Header'
import AdminRequestsWrapper from '@/components/requests/admin/AdminRequestsWrapper'
import { PasswordResetRequest } from '@/types'

export default async function AdminRequestsPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/home')

  // This page is only reachable by role = 'admin' (enforced by
  // app/(app)/admin/layout.tsx). Per the verified requests_select rule
  // (Database/requests-schema.sql + Database/migrations/management-requests-access.sql),
  // an admin can see every request unconditionally — no team-leader
  // narrowing here (that narrowing existed in the old Supabase-era JS
  // filter below this page used to run, but it isn't part of the actual
  // authorization rule, so it's dropped rather than ported).
  const [requestsData, resetRequests] = await Promise.all([
    queryRequestsWithDetail(sql`true`),
    // profiles joined by profile_id: password_reset_requests has two FKs to
    // profiles (profile_id, reviewed_by), which used to require
    // `profiles!password_reset_requests_profile_id_fkey(...)` in the old
    // PostgREST embed to disambiguate — an explicit JOIN here does the same.
    sql<(PasswordResetRequest & { profiles: { full_name: string; email: string } })[]>`
      SELECT prr.*, jsonb_build_object('full_name', p.full_name, 'email', p.email) AS profiles
      FROM password_reset_requests prr
      JOIN profiles p ON p.id = prr.profile_id
      WHERE prr.status = 'pending'
      ORDER BY prr.created_at ASC
    `,
  ])

  const requests = requestsData

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const totalPending = pendingCount + (resetRequests?.length ?? 0)

  return (
    <div className="flex-1 overflow-auto">
      <Header
        title={`Requests${totalPending > 0 ? ` (${totalPending} pending)` : ''}`}
        userId={userId}
      />
      <div className="p-6">
        <AdminRequestsWrapper
          requests={requests}
          currentUserId={userId}
          resetRequests={(resetRequests ?? []) as PasswordResetRequest[]}
        />
      </div>
    </div>
  )
}
