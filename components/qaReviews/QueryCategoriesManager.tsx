'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import type { QaQueryCategory } from '@/types'
import { DEPARTMENTS, type Department } from '@/lib/departments'
import { DEPARTMENT_LABELS } from '@/lib/qa/constants'
import { createQueryCategoryAction, updateQueryCategoryAction } from '@/app/(app)/qa-reviews/settingsActions'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

interface Props {
  /** All categories, inactive included (getQueryCategories order). */
  categories: QaQueryCategory[]
}

const inputCls = 'w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none'
const cardCls = 'bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800'
const smallBtnCls = 'text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50'

function CategoryRow({ category, onError }: { category: QaQueryCategory; onError: (message: string) => void }) {
  const router = useRouter()
  const [name, setName] = useState(category.name)
  const [busy, setBusy] = useState(false)
  const renamed = name.trim() !== category.name

  async function save(change: { name?: string; isActive?: boolean }) {
    onError('')
    setBusy(true)
    const res = await updateQueryCategoryAction({ id: category.id, ...change })
    setBusy(false)
    if ('error' in res) { onError(res.error); return }
    router.refresh()
  }

  return (
    <li className="flex items-center gap-2 py-1.5">
      <input
        aria-label={`Name of ${category.name}`} value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && renamed) save({ name }) }}
        className={`${inputCls} ${category.is_active ? '' : 'text-gray-400 dark:text-gray-500 line-through'}`}
      />
      {renamed && <button type="button" disabled={busy} onClick={() => save({ name })} className={smallBtnCls}>Save</button>}
      <button type="button" disabled={busy} onClick={() => save({ isActive: !category.is_active })} className={smallBtnCls}
        title={category.is_active ? 'Hide from the review form; existing reviews keep it' : 'Offer it on the review form again'}>
        {category.is_active ? 'Retire' : 'Restore'}
      </button>
    </li>
  )
}

function DepartmentCard({ department, categories }: { department: Department; categories: QaQueryCategory[] }) {
  const router = useRouter()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setAdding(true)
    const res = await createQueryCategoryAction({ department, name: newName })
    setAdding(false)
    if ('error' in res) { setError(res.error); return }
    setNewName('')
    router.refresh()
  }

  return (
    <div className={`${cardCls} p-4 space-y-2`}>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{DEPARTMENT_LABELS[department]}</h3>
      {categories.length === 0
        ? <p className="text-xs text-gray-400 dark:text-gray-500">No categories yet.</p>
        : <ul>{categories.map((c) => <CategoryRow key={`${c.id}:${c.name}`} category={c} onError={setError} />)}</ul>}
      <form onSubmit={handleAdd} className="flex items-center gap-2 pt-1">
        <input aria-label={`New ${DEPARTMENT_LABELS[department]} category`} placeholder="New category" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} />
        <button type="submit" disabled={adding || !newName.trim()} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg">
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
        </button>
      </form>
      <FormErrorBanner message={error} />
    </div>
  )
}

/** Scorecard settings: the per-department "Query / Category" options offered on the review form. */
export default function QueryCategoriesManager({ categories }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Query categories</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">The options for Query / Category on a review, per department. Retiring one hides it from new reviews; reviews that already use it keep it.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {DEPARTMENTS.map((d) => <DepartmentCard key={d} department={d} categories={categories.filter((c) => c.department === d)} />)}
      </div>
    </div>
  )
}
