'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, History, Loader2 } from 'lucide-react'
import { setMyQueueAction, getMyQueueAction, getQueueHistoryAction, type QueueHistoryRow } from '@/lib/queues/actions'
import { QUEUES } from '@/lib/t2/constants'
import { PICKER_EXTENDED_QUEUES, SOCIAL_QUEUES } from '@/lib/queues/constants'
import { BILLING_AGENT_QUEUES } from '@/lib/billing/constants'
import { formatDateKey, getISOWeekStart } from '@/lib/roster/calendarUtils'
import { format } from 'date-fns'

const SOCIAL_LABELS: Record<string, string> = {
  freescout: 'Freescout',
  whatsapp: 'WhatsApp',
  hellopeter: 'HelloPeter',
  mybroadband: 'MyBroadband',
  pissedcustomer: 'PissedCustomer',
}

interface QueueGroup {
  key: string
  label: string
  options: { value: string; label: string }[]
}

/**
 * The extended queues sit under the Social heading here because that is how
 * the business groups them, but they are deliberately NOT added to
 * SOCIAL_QUEUES itself — that list drives the reporting Social channel
 * summary, which reads support_tickets.channel, and these are
 * assignment-only (no support ticket can hold one). This is a display
 * grouping, not a change of meaning.
 */
const QUEUE_GROUPS: QueueGroup[] = [
  {
    key: 'social',
    label: 'Social',
    options: [
      ...SOCIAL_QUEUES.map((q) => ({ value: q, label: SOCIAL_LABELS[q] ?? q })),
      // Already in the casing the business uses, so no label mapping needed.
      ...PICKER_EXTENDED_QUEUES.map((q) => ({ value: q, label: q })),
    ],
  },
  {
    key: 't2',
    label: 'T2',
    options: QUEUES.map((q) => ({ value: q, label: q })),
  },
]

interface Props {
  /** Billing agents work from Teams or Station, not the Social/T2 queue vocabulary — show just those 2. */
  isBillingAgent?: boolean
}

/**
 * Current-queue pill + picker, mounted via Header's extraAction on every
 * /tickets* page. Replaces T2's old "Your queue today" always-expanded
 * banner on the retired /t2 page — its "last reassignments" list folds
 * into this click-triggered popover instead.
 *
 * The queue picker is a custom listbox rather than a <select>: with the
 * extended queues there are 17 of them, and <optgroup> cannot collapse, so
 * the native control gave a long flat scroll with no way to put a section
 * away. Groups here remember whether they are open for the session.
 */
export default function MyQueueWidget({ isBillingAgent = false }: Props) {
  const [queue, setQueue] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<QueueHistoryRow[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const ref = useRef<HTMLDivElement>(null)

  /** Monday of the current ISO week, 'YYYY-MM-DD'. */
  const weekStart = useMemo(() => formatDateKey(getISOWeekStart(new Date())), [])

  useEffect(() => {
    getMyQueueAction().then((res) => {
      if (res.data) setQueue(res.data.queue)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function openPopover() {
    setPending(queue ?? '')
    setReason('')
    setError('')
    setOpen(true)
    setPickerOpen(false)
    setHistory(null)
    // Ask the server for this week only. Everything older stays on the Queue
    // Assignment page's History tab — this widget is "what happened to me
    // this week", and it empties itself when a new week starts rather than
    // growing without bound.
    getQueueHistoryAction({ mine: true, from: weekStart }).then((res) => {
      if (res.data) setHistory(res.data)
    })
  }

  async function handleSave() {
    if (!pending || pending === queue) { setOpen(false); return }
    setSaving(true)
    setError('')
    const result = await setMyQueueAction(pending, reason.trim() || undefined)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setQueue(pending)
    setOpen(false)
  }

  const groups: QueueGroup[] = isBillingAgent
    ? [{ key: 'billing', label: 'Working from', options: BILLING_AGENT_QUEUES.map((q) => ({ value: q, label: q })) }]
    : QUEUE_GROUPS

  const pendingLabel = groups.flatMap((g) => g.options).find((o) => o.value === pending)?.label

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={openPopover}
        title="Change your current queue"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <>
            <span className="text-gray-400 dark:text-gray-500">Queue:</span>
            <span className="font-semibold">{queue ?? 'Not set'}</span>
          </>
        )}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-50 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Set current queue</label>

            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
              className="w-full flex items-center justify-between px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <span className={pendingLabel ? '' : 'text-gray-400 dark:text-gray-500'}>
                {pendingLabel ?? 'Select queue...'}
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {pickerOpen && (
              <div
                role="listbox"
                className="mt-1 max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/60"
              >
                {groups.map((group) => {
                  const isCollapsed = collapsed[group.key] ?? false
                  return (
                    <div key={group.key}>
                      <button
                        type="button"
                        onClick={() => setCollapsed((c) => ({ ...c, [group.key]: !isCollapsed }))}
                        aria-expanded={!isCollapsed}
                        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        {isCollapsed
                          ? <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                          : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
                        {group.label}
                        <span className="ml-auto font-normal text-gray-400 dark:text-gray-500">{group.options.length}</span>
                      </button>

                      {!isCollapsed && group.options.map((opt) => {
                        const selected = pending === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => { setPending(opt.value); setPickerOpen(false) }}
                            className={`w-full flex items-center gap-2 pl-7 pr-2.5 py-1.5 text-sm text-left transition-colors ${
                              selected
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            {selected ? <Check className="w-3.5 h-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !pending}
              className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              <History className="w-3 h-3" /> This week
              <span className="ml-auto font-normal text-gray-400 dark:text-gray-500">
                from {format(new Date(`${weekStart}T00:00:00`), 'dd MMM')}
              </span>
            </p>
            {history === null ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">Loading...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No queue changes this week.</p>
            ) : (
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {history.map((h, i) => (
                  <li key={i} className="text-xs text-gray-500 dark:text-gray-400">
                    {h.previous_queue ?? '—'} → <span className="font-medium text-gray-700 dark:text-gray-300">{h.new_queue ?? 'bench'}</span>
                    {h.effective_at && <span className="text-gray-400 dark:text-gray-500"> · {format(new Date(h.effective_at), 'dd MMM HH:mm')}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              Earlier weeks are kept on the Queue Assignment page.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
