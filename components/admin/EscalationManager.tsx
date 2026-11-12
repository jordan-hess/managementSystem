'use client'

import { useState } from 'react'
import { createEscalationAction } from '@/app/(app)/admin/escalations/actions'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import CustomerSearchField from '@/components/tickets/CustomerSearchField'
import { Followup, Priority, CaseCategory } from '@/types'
import { Plus, AlertTriangle, Send, Clock, CalendarOff } from 'lucide-react'
import { format } from 'date-fns'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

type EscalationField = 'agent' | 'customer' | 'query_description' | 'category'
const ESCALATION_FIELDS: readonly EscalationField[] = ['agent', 'customer', 'query_description', 'category']

interface Props {
  agents: { id: string; full_name: string; email: string }[]
  customers: { id: string; name: string; phone: string }[]
  escalations: (Followup & { customers: any; profiles: any; case_categories: { id: string; name: string } | null })[]
  categories: CaseCategory[]
  /** agent_id's currently scheduled off tomorrow — see lib/roster/scheduleAlerts.ts.
   *  A plain array (not a Set) since it crosses the server/client boundary as a prop. */
  offTomorrowAgentIds?: string[]
}

const empty: { agent_id: string; customer_id: string; query_description: string; possible_solution: string; priority: Priority; due_date: string; category_id: string } = {
  agent_id: '', customer_id: '', query_description: '', possible_solution: '',
  priority: 'high', due_date: '', category_id: '',
}

const priorityBadge: Record<string, string> = {
  low:    'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  normal: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  high:   'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
  urgent: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
}

const statusBadge: Record<string, string> = {
  open:        'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  in_progress: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  resolved:    'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  closed:      'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export default function EscalationManager({ agents, customers, escalations, categories, offTomorrowAgentIds = [] }: Props) {
  const router = useRouter()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<EscalationField>(ESCALATION_FIELDS)

  const activeCategories = categories.filter(c => c.is_active)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    clearAll()
    const errs: Partial<Record<EscalationField, string>> = {}
    if (!form.agent_id) errs.agent = 'Please select an agent.'
    if (!form.customer_id) errs.customer = 'Please select a customer.'
    if (!form.query_description.trim()) errs.query_description = 'Issue description is required.'
    if (!form.category_id) errs.category = 'Please select a category.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    setSaving(true)

    try {
      await createEscalationAction({
        agentId: form.agent_id,
        customerId: form.customer_id,
        queryDescription: form.query_description,
        possibleSolution: form.possible_solution,
        priority: form.priority,
        dueDate: form.due_date ? new Date(form.due_date).toISOString() : null,
        categoryId: form.category_id,
      })
    } catch (err) {
      applyActionError({ error: err instanceof Error ? err.message : 'Failed to send escalation.' })
      setSaving(false)
      return
    }

    setSaving(false)
    setModal(false)
    setForm(empty)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{escalations.length} total escalations</p>
        <button onClick={() => { setModal(true); clearAll() }}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <Send className="w-4 h-4" /> Send Escalation
        </button>
      </div>

      {escalations.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 py-16 text-center">
          <AlertTriangle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No escalations yet</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 shadow-sm">
          {escalations.map(esc => (
            <div key={esc.id} className="px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-2 shrink-0">
                    <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{esc.customers?.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{esc.customers?.phone}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Assigned to: <span className="font-medium">{esc.profiles?.full_name}</span></p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{esc.query_description}</p>
                    {!!esc.agent_id && offTomorrowAgentIds.includes(esc.agent_id) && (
                      <p className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 mt-1 font-medium">
                        <CalendarOff className="w-3 h-3" /> {esc.profiles?.full_name} is off tomorrow — consider reassigning
                      </p>
                    )}
                    {esc.possible_solution && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Solution: {esc.possible_solution}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {esc.due_date && (
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Clock className="w-3 h-3" />Due {format(new Date(esc.due_date), 'dd MMM yyyy')}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-gray-500">{format(new Date(esc.created_at), 'dd MMM yyyy HH:mm')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityBadge[esc.priority]}`}>{esc.priority}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[esc.status]}`}>{esc.status.replace('_', ' ')}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">
                    {esc.case_categories?.name ?? 'Uncategorized'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Send Escalation to Agent">
        <form onSubmit={handleSend} noValidate className="space-y-4">
          <div>
            <label className={labelCls}>Assign to Agent *</label>
            <select
              id="escalation-agent" required value={form.agent_id} onChange={e => { setForm({ ...form, agent_id: e.target.value }); clearFieldError('agent') }}
              className={fieldInputClass(inputCls, !!fieldErrors.agent)} {...fieldA11y('escalation-agent', fieldErrors.agent)}
            >
              <option value="">Select agent...</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.full_name} — {a.email}</option>)}
            </select>
            <FieldError id="escalation-agent" message={fieldErrors.agent} />
          </div>
          <CustomerSearchField
            customers={customers}
            value={form.customer_id}
            onChange={(id) => { setForm({ ...form, customer_id: id }); clearFieldError('customer') }}
            required
            id="escalation-customer"
            error={fieldErrors.customer}
          />
          <div>
            <label className={labelCls}>Issue Description *</label>
            <textarea
              id="escalation-query_description" required rows={3} value={form.query_description} onChange={e => { setForm({ ...form, query_description: e.target.value }); clearFieldError('query_description') }}
              className={`${fieldInputClass(inputCls, !!fieldErrors.query_description)} resize-none`} {...fieldA11y('escalation-query_description', fieldErrors.query_description)}
              placeholder="Describe the escalated issue..."
            />
            <FieldError id="escalation-query_description" message={fieldErrors.query_description} />
          </div>
          <div>
            <label className={labelCls}>Suggested Solution</label>
            <textarea rows={2} value={form.possible_solution} onChange={e => setForm({ ...form, possible_solution: e.target.value })}
              className={`${inputCls} resize-none`} placeholder="Any guidance for the agent..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as any })} className={inputCls}>
                {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Due Date</label>
              <input type="datetime-local" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Category *</label>
            <select
              id="escalation-category" required value={form.category_id} onChange={e => { setForm({ ...form, category_id: e.target.value }); clearFieldError('category') }}
              className={fieldInputClass(inputCls, !!fieldErrors.category)} {...fieldA11y('escalation-category', fieldErrors.category)}
            >
              <option value="">Select category...</option>
              {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <FieldError id="escalation-category" message={fieldErrors.category} />
          </div>
          <FormErrorBanner message={formError} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg font-medium">
              <Send className="w-3.5 h-3.5" />
              {saving ? 'Sending...' : 'Send Escalation'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
