import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const userId = await getCurrentUserId()
  const rows = await sql<{ role: string }[]>`SELECT role FROM profiles WHERE id = ${userId!}`
  const profile = rows[0]

  if (profile?.role !== 'admin') redirect('/dashboard')

  return <>{children}</>
}
