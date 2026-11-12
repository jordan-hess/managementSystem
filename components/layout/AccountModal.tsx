'use client'

import { useState } from 'react'
import { Eye, EyeOff, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import { updateOwnProfile } from '@/app/(app)/actions'
import { isValidEmail } from '@/lib/forms/validators'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type ProfileField = 'full_name' | 'email'
type PasswordField = 'new_password' | 'confirm_password'
const PROFILE_FIELDS: readonly ProfileField[] = ['full_name', 'email']
const PASSWORD_FIELDS: readonly PasswordField[] = ['new_password', 'confirm_password']

interface AccountModalProps {
  open: boolean
  onClose: () => void
  userId: string
  fullName: string
  email: string
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export default function AccountModal({ open, onClose, userId, fullName, email }: AccountModalProps) {
  const router = useRouter()

  const [profileForm, setProfileForm] = useState({ full_name: fullName, email })
  const [profileSaving, setProfileSaving] = useState(false)
  const profile = useFormErrors<ProfileField>(PROFILE_FIELDS)
  const [profileSuccess, setProfileSuccess] = useState('')

  // This component never unmounts (Header always renders it; only Modal's
  // children get hidden via `open`), so the useState initializer above only
  // ever ran once — at Header's first render, before its async
  // getHeaderProfileAction() fetch resolved fullName/email past their
  // empty-string defaults, and profileForm was never touched again.
  // Re-sync during render when `open` flips true (React's documented
  // "adjusting state when a prop changes" pattern) rather than in a
  // useEffect, so the form reflects the current profile every time it's
  // opened and any stale success/error from a prior visit is cleared.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setProfileForm({ full_name: fullName, email })
      profile.clearAll()
      setProfileSuccess('')
    }
  }

  const [pwForm, setPwForm] = useState({ password: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const pw = useFormErrors<PasswordField>(PASSWORD_FIELDS)
  const [pwSuccess, setPwSuccess] = useState('')
  const [showPw, setShowPw] = useState(false)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    profile.clearAll()
    setProfileSuccess('')
    const errs: Partial<Record<ProfileField, string>> = {}
    if (!profileForm.full_name.trim()) errs.full_name = 'Full name is required.'
    if (!profileForm.email.trim()) errs.email = 'Email is required.'
    else if (!isValidEmail(profileForm.email)) errs.email = 'Enter a valid email address.'
    if (Object.keys(errs).length > 0) { profile.setFieldErrors(errs); return }
    setProfileSaving(true)

    const updates: { full_name?: string; email?: string } = {}
    if (profileForm.full_name !== fullName) updates.full_name = profileForm.full_name
    if (profileForm.email !== email) updates.email = profileForm.email

    if (Object.keys(updates).length === 0) {
      setProfileSaving(false)
      setProfileSuccess('No changes to save.')
      return
    }

    if (updates.full_name) {
      const result = await updateOwnProfile(updates.full_name)
      if ('error' in result) { profile.applyActionError(result); setProfileSaving(false); return }
    }

    if (updates.email) {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: updates.email }),
      })
      const data = await res.json()
      if (!res.ok) { profile.applyActionError({ error: data.error || 'Something went wrong.', field: data.field }); setProfileSaving(false); return }
      setProfileSuccess('Profile updated successfully.')
    } else {
      setProfileSuccess('Profile updated successfully.')
    }

    setProfileSaving(false)
    router.refresh()
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    pw.clearAll()
    setPwSuccess('')

    const errs: Partial<Record<PasswordField, string>> = {}
    if (pwForm.password.length < 8) errs.new_password = 'Password must be at least 8 characters.'
    if (pwForm.password !== pwForm.confirm) errs.confirm_password = 'Passwords do not match.'
    if (Object.keys(errs).length > 0) { pw.setFieldErrors(errs); return }

    setPwSaving(true)
    const res = await fetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwForm.password }),
    })
    const data = await res.json()
    setPwSaving(false)

    if (!res.ok) { pw.applyActionError({ error: data.error || 'Something went wrong.' }); return }
    setPwSuccess('Password updated successfully.')
    setPwForm({ password: '', confirm: '' })
  }

  return (
    <Modal open={open} onClose={onClose} title="Account">
      <div className="space-y-6">

        {/* Profile info */}
        <form onSubmit={saveProfile} noValidate className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Profile Information</h3>
          <div>
            <label className={labelCls}>Full Name</label>
            <input
              id="account-full_name" required
              value={profileForm.full_name}
              onChange={e => { setProfileForm(f => ({ ...f, full_name: e.target.value })); profile.clearFieldError('full_name') }}
              className={fieldInputClass(inputCls, !!profile.fieldErrors.full_name)} {...fieldA11y('account-full_name', profile.fieldErrors.full_name)}
            />
            <FieldError id="account-full_name" message={profile.fieldErrors.full_name} />
          </div>
          <div>
            <label className={labelCls}>Email Address</label>
            <input
              id="account-email" required
              type="email"
              value={profileForm.email}
              onChange={e => { setProfileForm(f => ({ ...f, email: e.target.value })); profile.clearFieldError('email') }}
              className={fieldInputClass(inputCls, !!profile.fieldErrors.email)} {...fieldA11y('account-email', profile.fieldErrors.email)}
            />
            <FieldError id="account-email" message={profile.fieldErrors.email} />
          </div>
          <FormErrorBanner message={profile.formError} />
          {profileSuccess && (
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />{profileSuccess}
            </p>
          )}
          <button
            type="submit"
            disabled={profileSaving}
            title="Save your profile changes"
            className="w-full py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
          >
            {profileSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>

        <div className="border-t border-gray-100 dark:border-gray-800" />

        {/* Change password */}
        <form onSubmit={changePassword} noValidate className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Change Password</h3>
          <div>
            <label className={labelCls}>New Password</label>
            <div className="relative">
              <input
                id="account-new_password" required
                type={showPw ? 'text' : 'password'}
                value={pwForm.password}
                onChange={e => { setPwForm(f => ({ ...f, password: e.target.value })); pw.clearFieldError('new_password') }}
                placeholder="Min. 8 characters"
                className={`${fieldInputClass(inputCls, !!pw.fieldErrors.new_password)} pr-10`} {...fieldA11y('account-new_password', pw.fieldErrors.new_password)}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                title={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <FieldError id="account-new_password" message={pw.fieldErrors.new_password} />
          </div>
          <div>
            <label className={labelCls}>Confirm New Password</label>
            <input
              id="account-confirm_password" required
              type={showPw ? 'text' : 'password'}
              value={pwForm.confirm}
              onChange={e => { setPwForm(f => ({ ...f, confirm: e.target.value })); pw.clearFieldError('confirm_password') }}
              className={fieldInputClass(inputCls, !!pw.fieldErrors.confirm_password)} {...fieldA11y('account-confirm_password', pw.fieldErrors.confirm_password)}
            />
            <FieldError id="account-confirm_password" message={pw.fieldErrors.confirm_password} />
          </div>
          <FormErrorBanner message={pw.formError} />
          {pwSuccess && (
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />{pwSuccess}
            </p>
          )}
          <button
            type="submit"
            disabled={pwSaving}
            title="Update your password"
            className="w-full py-2 text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 disabled:bg-gray-500 rounded-lg transition-colors"
          >
            {pwSaving ? 'Updating...' : 'Update Password'}
          </button>
        </form>

      </div>
    </Modal>
  )
}
