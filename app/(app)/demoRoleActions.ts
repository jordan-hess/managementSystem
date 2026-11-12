'use server'

import { cookies } from 'next/headers'
import { DEMO_ROLE_COOKIE, isDemoRole } from '@/lib/auth/demoRoles'

export async function setDemoRole(role: string): Promise<{ error?: string }> {
  if (!isDemoRole(role)) return { error: 'Unknown role.' }

  ;(await cookies()).set(DEMO_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return {}
}

/** "Sign out": forget the picked role so the role-select modal opens again. */
export async function clearDemoRole(): Promise<void> {
  ;(await cookies()).delete(DEMO_ROLE_COOKIE)
}
