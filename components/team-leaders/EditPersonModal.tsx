'use client'

import { useState } from 'react'
import { updatePersonProfile } from '@/app/(app)/team-leaders/actions'
import Modal from '@/components/ui/Modal'
import { Role, Profile } from '@/types'
import { isValidEmail } from '@/lib/forms/validators'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type PersonField = 'full_name' | 'email' | 'role'
const PERSON_FIELDS: readonly PersonField[] = ['full_name', 'email', 'role']

type PersonLite = Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'department' | 'is_active'>

interface Props {
  person: PersonLite | null
  isCurrentlyLeading: boolean
  currentUserId?: string
  /** admin/management/hod only — team_leader-tier callers can open this modal
   *  to edit email, but department/role stay read-only for them (also
   *  enforced server-side in updatePersonProfile, not just hidden here). */
  canEditRoleAndDept: boolean
  onClose: () => void
  onSuccess: () => void
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export default function EditPersonModal({ person, isCurrentlyLeading, currentUserId, canEditRoleAndDept, onClose, onSuccess }: Props) {
  // Rendered with a key={person.id} by the caller, so a fresh instance (and
  // fresh initial state below) mounts whenever a different person is edited
  // — no effect needed to "reset" the form on prop change.
  const [form, setForm] = useState(() => ({
    full_name: person?.full_name ?? '',
    email: person?.email ?? '',
    department: person?.department ?? '',
    role: (person?.role ?? 'agent') as Role,
  }))
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, setFormError, clearAll, applyActionError } = useFormErrors<PersonField>(PERSON_FIELDS)

  if (!person) return null
  const currentPerson = person
  const isSelf = currentUserId === currentPerson.id

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    clearAll()

    const errs: Partial<Record<PersonField, string>> = {}
    if (canEditRoleAndDept && !form.full_name.trim()) errs.full_name = 'Full name is required.'
    if (!form.email.trim()) errs.email = 'Email is required.'
    else if (!isValidEmail(form.email)) errs.email = 'Enter a valid email address.'
    if (isCurrentlyLeading && form.role !== 'admin') {
      const roleConflict = 'This person currently leads a team — remove them as team leader (drag them out of the leader slot) before changing their role away from admin.'
      // The role select only exists for callers who can edit roles; for everyone else there is no input to blame.
      if (canEditRoleAndDept) errs.role = roleConflict
      else { setFormError(roleConflict); return }
    }
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    setSaving(true)
    const result = await updatePersonProfile(currentPerson.id, {
      full_name: form.full_name,
      email: form.email,
      department: form.department || null,
      role: isSelf ? currentPerson.role : form.role,
    })

    setSaving(false)
    if ('error' in result) { applyActionError(result); return }
    onSuccess()
  }

  return (
    <Modal open={!!person} onClose={onClose} title="Edit Person">
      <form onSubmit={handleSave} noValidate className="space-y-4">
        <div>
          <label className={labelCls}>Full Name</label>
          {canEditRoleAndDept ? (
            <>
              <input
                id="edit-person-full_name" required value={form.full_name} onChange={e => { setForm(f => ({ ...f, full_name: e.target.value })); clearFieldError('full_name') }}
                className={fieldInputClass(inputCls, !!fieldErrors.full_name)} {...fieldA11y('edit-person-full_name', fieldErrors.full_name)}
              />
              <FieldError id="edit-person-full_name" message={fieldErrors.full_name} />
            </>
          ) : (
            <p className="text-sm text-gray-900 dark:text-white px-3 py-2">{form.full_name}</p>
          )}
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input
            id="edit-person-email" type="email" required value={form.email} onChange={e => { setForm(f => ({ ...f, email: e.target.value })); clearFieldError('email') }}
            className={fieldInputClass(inputCls, !!fieldErrors.email)} {...fieldA11y('edit-person-email', fieldErrors.email)}
          />
          <FieldError id="edit-person-email" message={fieldErrors.email} />
        </div>
        <div>
          <label className={labelCls}>Department</label>
          {canEditRoleAndDept ? (
            <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className={inputCls} />
          ) : (
            <p className="text-sm text-gray-900 dark:text-white px-3 py-2">{form.department || '—'}</p>
          )}
        </div>
        {canEditRoleAndDept ? (
          <div>
            <label className={labelCls}>Role</label>
            <select
              id="edit-person-role" value={form.role} onChange={e => { setForm(f => ({ ...f, role: e.target.value as Role })); clearFieldError('role') }} disabled={isSelf}
              className={fieldInputClass(inputCls, !!fieldErrors.role)} {...fieldA11y('edit-person-role', fieldErrors.role)}
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
              <option value="management">Management</option>
              <option value="hod">HOD</option>
              <option value="qa_analyst">QA Analyst</option>
            </select>
            <FieldError id="edit-person-role" message={fieldErrors.role} />
            {isSelf && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">You can&apos;t change your own role here.</p>
            )}
            {!isSelf && isCurrentlyLeading && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Currently leads a team — must stay Admin, or be removed as leader first.</p>
            )}
          </div>
        ) : (
          <div>
            <label className={labelCls}>Role</label>
            <p className="text-sm text-gray-900 dark:text-white px-3 py-2 capitalize">{form.role.replace('_', ' ')}</p>
          </div>
        )}
        <FormErrorBanner message={formError} />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors font-medium">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
