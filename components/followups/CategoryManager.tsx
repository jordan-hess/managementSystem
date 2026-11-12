'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { CaseCategory } from '@/types'
import { Plus, Edit2, Loader2, ChevronLeft, EyeOff, Eye } from 'lucide-react'
import { createCaseCategory, updateCaseCategory, toggleCaseCategoryActive } from './actions'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  categories: CaseCategory[]
}

type View = 'list' | 'form'

const emptyForm = { name: '' }

export default function CategoryManager({ open, onClose, onSuccess, categories }: Props) {
  const [view, setView] = useState<View>('list')
  const [editing, setEditing] = useState<CaseCategory | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<'name'>(['name'])

  useEffect(() => {
    if (!open) { setView('list'); setEditing(null); setForm(emptyForm); clearAll() }
  }, [open, clearAll])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    clearAll()
    setView('form')
  }

  function openEdit(c: CaseCategory) {
    setEditing(c)
    setForm({ name: c.name })
    clearAll()
    setView('form')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    const name = form.name.trim()
    if (!name) { setFieldErrors({ name: 'Name is required.' }); return }
    setSaving(true)

    const result = editing
      ? await updateCaseCategory(editing.id, name)
      : await createCaseCategory(name)

    setSaving(false)
    if ('error' in result) {
      applyActionError(result)
      return
    }
    onSuccess()
    setView('list')
    setEditing(null)
  }

  async function toggleActive(c: CaseCategory) {
    setTogglingId(c.id); clearAll()

    const result = await toggleCaseCategoryActive(c.id, !c.is_active)

    setTogglingId(null)
    if ('error' in result) { applyActionError(result); return }
    onSuccess()
  }

  const title = view === 'list' ? 'Case Categories' : editing ? 'Edit Category' : 'New Category'

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {view === 'list' ? (
        <div className="space-y-3">
          {categories.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No categories yet.</p>
          ) : (
            <div className="space-y-2">
              {categories.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${c.is_active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{c.name}</p>
                    {!c.is_active && <p className="text-xs text-gray-400 dark:text-gray-500">Inactive</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(c)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                      title="Rename"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleActive(c)}
                      disabled={togglingId === c.id}
                      className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                      title={c.is_active ? 'Deactivate' : 'Reactivate'}
                    >
                      {togglingId === c.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : c.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <FormErrorBanner message={formError} />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Close
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> New category
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <button
            type="button"
            onClick={() => { setView('list'); clearAll() }}
            className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to list
          </button>

          <div>
            <label className={labelCls}>Name</label>
            <input
              id="category-name" required value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); clearFieldError('name') }}
              placeholder="e.g. Billing"
              className={fieldInputClass(inputCls, !!fieldErrors.name)} {...fieldA11y('category-name', fieldErrors.name)}
            />
            <FieldError id="category-name" message={fieldErrors.name} />
          </div>

          <FormErrorBanner message={formError} />

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setView('list'); clearAll() }} className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create category'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
