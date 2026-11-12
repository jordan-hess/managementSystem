'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { createCustomer, updateCustomer } from '@/app/(app)/customers/actions'
import { sanitizePhoneInput } from '@/lib/customers/phone'
import { Customer } from '@/types'
import { useFormErrors, type FieldErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import { isValidEmail } from '@/lib/forms/validators'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type CustomerField = 'name' | 'phone' | 'email'
const CUSTOMER_FIELDS: readonly CustomerField[] = ['name', 'phone', 'email']

interface Props {
  open: boolean
  onClose: () => void
  editing: Customer | null
  onSaved: (customer: Customer) => void
}

const empty = { name: '', phone: '', email: '', account_number: '', notes: '' }
const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

/** Add/edit-customer form — relocated from CustomerManager.tsx (Phase 2), still needed once /customers is gone. */
export default function CustomerFormModal({ open, onClose, editing, onSaved }: Props) {
  const [form, setForm] = useState(editing
    ? { name: editing.name, phone: editing.phone, email: editing.email || '', account_number: editing.account_number || '', notes: editing.notes || '' }
    : empty)
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<CustomerField>(CUSTOMER_FIELDS)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    const errs: FieldErrors<CustomerField> = {}
    if (!form.name.trim()) errs.name = 'Name is required.'
    if (!form.phone.trim()) errs.phone = 'Phone number is required.'
    if (!form.email.trim()) errs.email = 'Email is required.'
    else if (!isValidEmail(form.email)) errs.email = 'Enter a valid email address.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    setSaving(true)
    const result = editing ? await updateCustomer(editing.id, form) : await createCustomer(form)
    setSaving(false)
    if ('error' in result) { applyActionError(result); return }
    onSaved(result.data)
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Customer' : 'Add Customer'}>
      <form onSubmit={handleSave} noValidate className="space-y-4">
        <div>
          <label className={labelCls}>Full Name *</label>
          <input
            id="customer-name" required value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); clearFieldError('name') }}
            className={fieldInputClass(inputCls, !!fieldErrors.name)} {...fieldA11y('customer-name', fieldErrors.name)}
          />
          <FieldError id="customer-name" message={fieldErrors.name} />
        </div>
        <div>
          <label className={labelCls}>Phone Number *</label>
          <input
            id="customer-phone" required type="tel" inputMode="tel" value={form.phone} onChange={e => { setForm({ ...form, phone: sanitizePhoneInput(e.target.value) }); clearFieldError('phone') }}
            className={fieldInputClass(inputCls, !!fieldErrors.phone)} {...fieldA11y('customer-phone', fieldErrors.phone)}
          />
          <FieldError id="customer-phone" message={fieldErrors.phone} />
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input
            id="customer-email" required type="email" value={form.email} onChange={e => { setForm({ ...form, email: e.target.value }); clearFieldError('email') }}
            className={fieldInputClass(inputCls, !!fieldErrors.email)} {...fieldA11y('customer-email', fieldErrors.email)}
          />
          <FieldError id="customer-email" message={fieldErrors.email} />
        </div>
        <div>
          <label className={labelCls}>Account Number</label>
          <input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`${inputCls} resize-none`} />
        </div>
        <FormErrorBanner message={formError} />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors font-medium">
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Customer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
