'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { Loader2 } from 'lucide-react'
import { addPersonToTeam, moveToLeaderSlot } from '@/app/(app)/team-leaders/actions'
import type { Role } from '@/types'
import { isValidEmail } from '@/lib/forms/validators'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const INPUT_CLS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
type MemberField = 'full_name' | 'email'
const MEMBER_FIELDS: readonly MemberField[] = ['full_name', 'email']

interface TeamOption { id: string; name: string }

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  /** Only passed when opened from the Team Management board — lets the new
   *  account be assigned to a team (and optionally its leader) in the same
   *  step. Omitted on the standalone Admin Agents page, where there's no
   *  team context and the form renders exactly as it did before. */
  teams?: TeamOption[]
}

export default function AddTeamMemberModal({ open, onClose, onSuccess, teams = [] }: Props) {
  const [form, setForm] = useState({ email: '', full_name: '', role: 'agent' as Role, department: '', teamId: '', makeLeader: false })
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<MemberField>(MEMBER_FIELDS)
  const [success, setSuccess] = useState('')

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    setSuccess('')
    const errs: Partial<Record<MemberField, string>> = {}
    if (!form.full_name.trim()) errs.full_name = 'Full name is required.'
    if (!form.email.trim()) errs.email = 'Email is required.'
    else if (!isValidEmail(form.email)) errs.email = 'Enter a valid email address.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    setSaving(true)

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email, full_name: form.full_name, role: form.role, department: form.department }),
    })
    const data = await res.json()

    if (!res.ok) {
      setSaving(false)
      applyActionError({ error: data.error || 'Failed to create user', field: data.field })
      return
    }

    let teamMessage = ''
    if (form.teamId) {
      const teamResult = form.makeLeader
        ? await moveToLeaderSlot(data.id, form.teamId, form.role)
        : await addPersonToTeam(data.id, form.teamId)
      if ('error' in teamResult) {
        teamMessage = ` — but could not assign them to the team: ${teamResult.error}`
      } else {
        const teamName = teams.find(t => t.id === form.teamId)?.name ?? 'the team'
        teamMessage = form.makeLeader ? ` and assigned as leader of ${teamName}` : ` and added to ${teamName}`
      }
    }

    const roleLabel = form.role === 'admin' ? 'Admin' : form.role === 'management' ? 'Manager' : form.role === 'hod' ? 'HOD' : 'Agent'
    setSuccess(`${roleLabel} ${form.full_name} created successfully${teamMessage}`)
    setForm({ email: '', full_name: '', role: 'agent', department: '', teamId: '', makeLeader: false })
    onSuccess()
    setSaving(false)
  }

  function handleClose() {
    clearAll()
    setSuccess('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Team Member">
      <form onSubmit={handleInvite} noValidate className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
          <input
            id="add-member-full_name" required value={form.full_name} onChange={e => { setForm({ ...form, full_name: e.target.value }); clearFieldError('full_name') }}
            className={fieldInputClass(INPUT_CLS, !!fieldErrors.full_name)} {...fieldA11y('add-member-full_name', fieldErrors.full_name)} />
          <FieldError id="add-member-full_name" message={fieldErrors.full_name} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
          <input
            id="add-member-email" required type="email" value={form.email} onChange={e => { setForm({ ...form, email: e.target.value }); clearFieldError('email') }}
            className={fieldInputClass(INPUT_CLS, !!fieldErrors.email)} {...fieldA11y('add-member-email', fieldErrors.email)} />
          <FieldError id="add-member-email" message={fieldErrors.email} />
        </div>
        {/* Every role this form can create gets a fixed initial password by
            role, not one typed in here — the server assigns it. They're
            required to set their own password on first sign-in via the
            existing forced password-change flow. */}
        <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          Initial password will be set automatically ({form.role === 'agent' ? 'demo-agent-pass' : 'demo-staff-pass'}) —
          they&apos;ll be prompted to set their own password on first sign-in.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={form.role} onChange={e => {
              const role = e.target.value as Role
              // A manager or HOD can't also be made team leader in the same
              // step — team_leaders' own DB trigger only allows admin/
              // team_leader roles, so moveToLeaderSlot would silently
              // overwrite the new role with 'team_leader' to satisfy it.
              setForm({ ...form, role, makeLeader: (role === 'management' || role === 'hod') ? false : form.makeLeader })
            }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none">
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
              <option value="management">Manager</option>
              <option value="hod">HOD</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="e.g. Sales" />
          </div>
        </div>
        {teams.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Team</label>
            <select
              value={form.teamId}
              onChange={e => setForm({ ...form, teamId: e.target.value, makeLeader: e.target.value ? form.makeLeader : false })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="">No team (unassigned)</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        {form.teamId && form.role !== 'management' && form.role !== 'hod' && (
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.makeLeader}
              onChange={e => setForm({ ...form, makeLeader: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-700 text-purple-600 focus:ring-purple-500"
            />
            Also make this person the team leader
          </label>
        )}
        {form.makeLeader && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Assigning a leader who isn&apos;t already an admin will automatically promote them to team leader.
          </p>
        )}
        <FormErrorBanner message={formError} />
        {success && <p className="text-sm text-green-700 bg-green-50 dark:bg-green-900/30 rounded-lg px-3 py-2">{success}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={handleClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {saving ? 'Creating...' : 'Create Account'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
