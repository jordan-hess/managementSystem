'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Eye, EyeOff, Check } from 'lucide-react'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type PasswordField = 'new_password' | 'confirm'
const PASSWORD_FIELDS: readonly PasswordField[] = ['new_password', 'confirm']

const inputCls = 'w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white'

export default function ChangePasswordForm() {
  const router = useRouter()

  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, setFormError, clearAll } = useFormErrors<PasswordField>(PASSWORD_FIELDS)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    const errs: Partial<Record<PasswordField, string>> = {}
    if (newPw.length < 8) errs.new_password = 'Password must be at least 8 characters.'
    if (newPw !== confirm) errs.confirm = 'Passwords do not match.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    setSaving(true)

    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw, clear_force_password_change: true }),
      })
      const data = await res.json()

      if (!res.ok) {
        setSaving(false)
        if (res.status === 401) { router.push('/home'); return }
        setFormError(data.error || 'Something went wrong.')
        return
      }

      // No sign-in in this copy (the demo role picks the user), so there's no
      // session to re-issue for the new password.
      setSaving(false)

      setDone(true)
      setTimeout(() => {
        window.location.href = '/home'
      }, 1500)
    } catch {
      setSaving(false)
      setFormError('Something went wrong.')
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-8">

        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-100 dark:bg-blue-900/40 rounded-full p-4 mb-4">
            <KeyRound className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">New Password Required</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 text-center">
            Your account has a temporary password. Please set a new password to continue.
          </p>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="bg-green-100 dark:bg-green-900/40 rounded-full p-3">
              <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Password updated — redirecting…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
              <div className="relative">
                <input
                  id="change-pw-new" required
                  type={showPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => { setNewPw(e.target.value); clearFieldError('new_password') }}
                  placeholder="Min. 8 characters"
                  className={`${fieldInputClass(inputCls, !!fieldErrors.new_password)} pr-10`}
                  {...fieldA11y('change-pw-new', fieldErrors.new_password)}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <FieldError id="change-pw-new" message={fieldErrors.new_password} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm Password</label>
              <input
                id="change-pw-confirm" required
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={e => { setConfirm(e.target.value); clearFieldError('confirm') }}
                className={fieldInputClass(inputCls, !!fieldErrors.confirm)}
                {...fieldA11y('change-pw-confirm', fieldErrors.confirm)}
              />
              <FieldError id="change-pw-confirm" message={fieldErrors.confirm} />
            </div>
            <FormErrorBanner message={formError} />
            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {saving ? 'Saving...' : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
