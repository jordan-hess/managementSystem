import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { canAccessTeamManagement, Role } from '@/lib/auth/authz'
import { redirect } from 'next/navigation'

export default async function TeamLeadersLayout({ children }: { children: React.ReactNode }) {
  const userId = await getCurrentUserId()
  const rows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  const profile = rows[0]

  if (!profile || !canAccessTeamManagement(profile.role)) redirect('/dashboard')

  return <>{children}</>
}
