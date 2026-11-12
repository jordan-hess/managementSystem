'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCog, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { DEMO_ROLES, demoRoleLabel } from '@/lib/auth/demoRoles'
import { setDemoRole } from '@/app/(app)/demoRoleActions'
import type { Role } from '@/types'

interface Props {
  /** The role picked so far, or null if the visitor hasn't picked one yet (modal is forced open). */
  currentRole: Role | null
  /** Shown under the active role when it has no seeded profile in the local database. */
  missingProfile?: boolean
}

export default function RoleSwitcher({ currentRole, missingProfile = false }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // No role yet (first visit, or after Sign out): the modal can't be dismissed.
  const mustChoose = currentRole === null
  const isOpen = open || mustChoose
  const [error, setError] = useState<string | null>(null)
  const [pendingRole, setPendingRole] = useState<Role | null>(null)
  const [isPending, startTransition] = useTransition()

  function choose(role: Role) {
    setError(null)
    setPendingRole(role)
    startTransition(async () => {
      const result = await setDemoRole(role)
      if (result.error) {
        setError(result.error)
        setPendingRole(null)
        return
      }
      setOpen(false)
      setPendingRole(null)
      // Land on /home: the current page may not be reachable by the new role.
      router.push('/home')
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={currentRole ? `Viewing as ${demoRoleLabel(currentRole)}. Switch role` : 'Choose a role'}
        aria-label="Switch role"
        className="flex items-center justify-center w-11.25 h-11.25 shrink-0 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
      >
        <UserCog className="w-4.5 h-4.5" />
      </button>

      <Modal
        open={isOpen}
        onClose={() => !isPending && setOpen(false)}
        dismissible={!mustChoose}
        title="Choose a role"
        size="2xl"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          This copy has no login and runs on local demo data. Pick the role you want to use the app as. You can switch any time from the button at the bottom of the sidebar.
        </p>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEMO_ROLES.map(({ role, label, description }) => {
            const active = role === currentRole
            const loading = isPending && pendingRole === role
            return (
              <li key={role}>
                <button
                  type="button"
                  onClick={() => choose(role)}
                  disabled={isPending}
                  aria-pressed={active}
                  className={`w-full h-full text-left px-4 py-3 rounded-xl border transition-colors disabled:cursor-wait
                    ${active
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-500'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'}
                    ${isPending && !loading ? 'opacity-50' : ''}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
                    {active && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
                    {loading && <span className="text-xs text-gray-500">Switching…</span>}
                  </span>
                  <span className="block mt-1 text-xs text-gray-600 dark:text-gray-400">{description}</span>
                  {active && missingProfile && (
                    <span className="block mt-1 text-xs text-amber-700 dark:text-amber-400">
                      No profile with this role in the local database (see Database/seeds/demo-role-profiles.sql).
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Modal>
    </>
  )
}
