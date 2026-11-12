// components/qaReviews/CoachingActionsPanel.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lightbulb } from 'lucide-react'
import { identifyCoachingOpportunities } from '@/lib/qa/coachingOpportunities'
import { applyLegs } from '@/lib/qa/scorecard'
import { reviewItemsToInputs } from '@/lib/qa/reviewItems'
import { createCoachingActionAction, updateCoachingActionAction } from '@/app/(app)/qa-reviews/coachingActions'
import { QaReviewWithDetail, CoachingAction, CoachingActionStatus } from '@/types'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type CoachingField = 'category' | 'required_action' | 'owner'
const COACHING_FIELDS: readonly CoachingField[] = ['category', 'required_action', 'owner']

function validateCoachingDraft(d: { category: string; requiredAction: string; ownerId: string }): Partial<Record<CoachingField, string>> {
  const e: Partial<Record<CoachingField, string>> = {}
  if (!d.category.trim()) e.category = 'Category is required.'
  if (!d.requiredAction.trim()) e.required_action = 'Required action is required.'
  if (!d.ownerId) e.owner = 'Owner is required.'
  return e
}

interface OwnerOption { id: string; full_name: string }

interface Props {
  review: QaReviewWithDetail
  ownerCandidates: OwnerOption[]
  canManage: boolean
}

interface DraftState {
  category: string
  notes: string
  requiredAction: string
  dueDate: string
  ownerId: string
}

function emptyDraft(defaultOwnerId: string): DraftState {
  return { category: '', notes: '', requiredAction: '', dueDate: '', ownerId: defaultOwnerId }
}

const STATUS_LABEL: Record<CoachingActionStatus, string> = { open: 'Open', in_progress: 'In Progress', completed: 'Completed' }
const STATUS_BADGE_CLS: Record<CoachingActionStatus, string> = {
  open: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  in_progress: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
}

function isOverdue(action: CoachingAction): boolean {
  if (action.status === 'completed' || !action.due_date) return false
  return action.due_date < new Date().toISOString().slice(0, 10)
}

export default function CoachingActionsPanel({ review, ownerCandidates, canManage }: Props) {
  const router = useRouter()
  const [creating, setCreating] = useState<DraftState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<(DraftState & { status: CoachingActionStatus }) | null>(null)
  const [saving, setSaving] = useState(false)
  // The create form and an edit form can be open at once, so each keeps its own errors.
  const create = useFormErrors<CoachingField>(COACHING_FIELDS)
  const edit = useFormErrors<CoachingField>(COACHING_FIELDS)

  // Same input getMyReviewsForMonth builds: stored legs (unused leg forced to N/A) plus the
  // coaching-only flags. Reason tags (types with an item_code) are not coaching flags.
  const opportunities = identifyCoachingOpportunities({
    items: applyLegs(reviewItemsToInputs(review.items), review.legs),
    coachingFlags: review.criticalFailures
      .filter((cf) => !cf.critical_failure_type?.item_code)
      .map((cf) => ({ name: cf.critical_failure_type?.name ?? 'Coaching flag', requiresCoaching: cf.requires_coaching_snapshot })),
  })

  const inputCls = 'w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none'
  const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1'

  async function handleCreate() {
    if (!creating) return
    create.clearAll()
    const errs = validateCoachingDraft(creating)
    if (Object.keys(errs).length > 0) { create.setFieldErrors(errs); return }
    setSaving(true)
    const result = await createCoachingActionAction({
      reviewId: review.id, category: creating.category, notes: creating.notes || null,
      requiredAction: creating.requiredAction, dueDate: creating.dueDate || null, ownerId: creating.ownerId,
    })
    setSaving(false)
    if (result.error) { create.applyActionError(result); return }
    setCreating(null)
    router.refresh()
  }

  async function handleUpdate() {
    if (!editingId || !editDraft) return
    edit.clearAll()
    const errs = validateCoachingDraft(editDraft)
    if (Object.keys(errs).length > 0) { edit.setFieldErrors(errs); return }
    setSaving(true)
    const result = await updateCoachingActionAction({
      id: editingId, category: editDraft.category, notes: editDraft.notes || null,
      requiredAction: editDraft.requiredAction, dueDate: editDraft.dueDate || null,
      ownerId: editDraft.ownerId, status: editDraft.status,
    })
    setSaving(false)
    if (result.error) { edit.applyActionError(result); return }
    setEditingId(null); setEditDraft(null)
    router.refresh()
  }

  function startEdit(action: CoachingAction) {
    setEditingId(action.id)
    setEditDraft({
      category: action.category, notes: action.notes ?? '', requiredAction: action.required_action,
      dueDate: action.due_date ?? '', ownerId: action.owner_id ?? '', status: action.status,
    })
    edit.clearAll()
  }

  return (
    <div className="space-y-3">
      {opportunities.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl shadow-sm border border-amber-200 dark:border-amber-800 space-y-2">
          <span className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <Lightbulb className="w-4 h-4" /> Coaching Opportunities
          </span>
          {opportunities.map((o, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-sm text-amber-900 dark:text-amber-200">
              <span>{o.label} — {o.reason}</span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setCreating({ ...emptyDraft(review.reviewer_id ?? ''), category: o.label })}
                  className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Create Coaching Action
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Coaching Actions</span>
          {canManage && !creating && (
            <button
              type="button"
              onClick={() => setCreating(emptyDraft(review.reviewer_id ?? ''))}
              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              + New coaching action
            </button>
          )}
        </div>

        {review.coachingActions.length === 0 && !creating && (
          <p className="text-sm text-gray-400 dark:text-gray-500">No coaching actions yet.</p>
        )}

        {review.coachingActions.map((action) => (
          <div key={action.id} className="border-t border-gray-100 dark:border-gray-800 pt-3 first:border-t-0 first:pt-0">
            {editingId === action.id && editDraft ? (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Category</label>
                  <input
                    id="coaching-edit-category" type="text" value={editDraft.category} onChange={(e) => { setEditDraft({ ...editDraft, category: e.target.value }); edit.clearFieldError('category') }}
                    className={fieldInputClass(inputCls, !!edit.fieldErrors.category)} {...fieldA11y('coaching-edit-category', edit.fieldErrors.category)}
                  />
                  <FieldError id="coaching-edit-category" message={edit.fieldErrors.category} />
                </div>
                <div>
                  <label className={labelCls}>Required action</label>
                  <input
                    id="coaching-edit-required_action" type="text" value={editDraft.requiredAction} onChange={(e) => { setEditDraft({ ...editDraft, requiredAction: e.target.value }); edit.clearFieldError('required_action') }}
                    className={fieldInputClass(inputCls, !!edit.fieldErrors.required_action)} {...fieldA11y('coaching-edit-required_action', edit.fieldErrors.required_action)}
                  />
                  <FieldError id="coaching-edit-required_action" message={edit.fieldErrors.required_action} />
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <textarea rows={2} value={editDraft.notes} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} className={`${inputCls} resize-none`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Due date</label>
                    <input type="date" value={editDraft.dueDate} onChange={(e) => setEditDraft({ ...editDraft, dueDate: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Owner</label>
                    <select
                      id="coaching-edit-owner" value={editDraft.ownerId} onChange={(e) => { setEditDraft({ ...editDraft, ownerId: e.target.value }); edit.clearFieldError('owner') }}
                      className={fieldInputClass(inputCls, !!edit.fieldErrors.owner)} {...fieldA11y('coaching-edit-owner', edit.fieldErrors.owner)}
                    >
                      {ownerCandidates.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                    </select>
                    <FieldError id="coaching-edit-owner" message={edit.fieldErrors.owner} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={editDraft.status} onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value as CoachingActionStatus })} className={inputCls}>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <FormErrorBanner message={edit.formError} />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setEditingId(null); setEditDraft(null); edit.clearAll() }} className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg">Cancel</button>
                  <button type="button" onClick={handleUpdate} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg">
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{action.category}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{action.required_action}</p>
                  {action.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{action.notes}</p>}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Owner: {action.owner?.full_name ?? '—'}{action.due_date && ` · Due ${action.due_date}`}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE_CLS[action.status]}`}>{STATUS_LABEL[action.status]}</span>
                  {isOverdue(action) && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">Overdue</span>
                  )}
                  {canManage && (
                    <button type="button" onClick={() => startEdit(action)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {creating && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
            <div>
              <label className={labelCls}>Category</label>
              <input
                id="coaching-new-category" type="text" value={creating.category} onChange={(e) => { setCreating({ ...creating, category: e.target.value }); create.clearFieldError('category') }}
                className={fieldInputClass(inputCls, !!create.fieldErrors.category)} {...fieldA11y('coaching-new-category', create.fieldErrors.category)}
              />
              <FieldError id="coaching-new-category" message={create.fieldErrors.category} />
            </div>
            <div>
              <label className={labelCls}>Required action</label>
              <input
                id="coaching-new-required_action" type="text" value={creating.requiredAction} onChange={(e) => { setCreating({ ...creating, requiredAction: e.target.value }); create.clearFieldError('required_action') }}
                className={fieldInputClass(inputCls, !!create.fieldErrors.required_action)} {...fieldA11y('coaching-new-required_action', create.fieldErrors.required_action)}
              />
              <FieldError id="coaching-new-required_action" message={create.fieldErrors.required_action} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea rows={2} value={creating.notes} onChange={(e) => setCreating({ ...creating, notes: e.target.value })} className={`${inputCls} resize-none`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Due date</label>
                <input type="date" value={creating.dueDate} onChange={(e) => setCreating({ ...creating, dueDate: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Owner</label>
                <select
                  id="coaching-new-owner" value={creating.ownerId} onChange={(e) => { setCreating({ ...creating, ownerId: e.target.value }); create.clearFieldError('owner') }}
                  className={fieldInputClass(inputCls, !!create.fieldErrors.owner)} {...fieldA11y('coaching-new-owner', create.fieldErrors.owner)}
                >
                  {ownerCandidates.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                </select>
                <FieldError id="coaching-new-owner" message={create.fieldErrors.owner} />
              </div>
            </div>
            <FormErrorBanner message={create.formError} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setCreating(null); create.clearAll() }} className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg">Cancel</button>
              <button type="button" onClick={handleCreate} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create Coaching Action
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
