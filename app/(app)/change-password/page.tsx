import { redirect } from 'next/navigation'
import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import ChangePasswordForm from '@/components/auth/ChangePasswordForm'

export default async function ChangePasswordPage() {
  const userId = await getCurrentUserId()

  if (!userId) redirect('/home')

  const rows = await sql<{ email: string }[]>`SELECT email FROM profiles WHERE id = ${userId}`
  const profile = rows[0]

  if (!profile?.email) redirect('/home')

  return <ChangePasswordForm />
}
