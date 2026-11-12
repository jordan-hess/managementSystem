'use client'

import { useEffect, useState } from 'react'
import { getQueueHistoryAction, type QueueHistoryRow } from '@/lib/queues/actions'
import { queueOptionLabel } from '@/lib/queues/constants'
import { DEPARTMENTS } from '@/lib/departments'
import type { BoardAgent } from '@/lib/queues/board'

type DateRange = 'day' | 'week' | 'month'
const DATE_RANGES: [DateRange, string][] = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']]
const HISTORY_PAGE_SIZE = 20

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

/** [from, to] (inclusive, 'YYYY-MM-DD') anchored on today: the current
 *  Mon-Sun week or calendar month, not a rolling window. */
function rangeFor(range: DateRange): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10)
  if (range === 'day') return { from: today, to: today }
  if (range === 'week') {
    const monday = mondayOf(today)
    return { from: monday, to: addDays(monday, 6) }
  }
  const d = new Date(`${today}T00:00:00Z`)
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  return { from, to }
}

// "Mon 3 Nov", built from UTC parts so the runner's timezone can't change it.
function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

// effective_at is 'YYYY-MM-DD HH24:MI:SS' in UTC; read the time straight off the string.
function formatTime(effectiveAt: string | null): string {
  return effectiveAt?.slice(11, 16) || '--:--'
}

// Main rows read "A → B" (null = bench). Additional-platform rows are an
// add ("+ X"), a removal ("− X", U+2212) or a move ("X → Y"), tagged "(additional)".
function queueChangeText(r: QueueHistoryRow): string {
  const prev = r.previous_queue ? queueOptionLabel(r.previous_queue) : null
  const next = r.new_queue ? queueOptionLabel(r.new_queue) : null
  if (r.kind === 'additional') {
    if (!prev && next) return `+ ${next} (additional)`
    if (prev && !next) return `− ${prev} (additional)`
    return `${prev} → ${next} (additional)`
  }
  return `${prev ?? 'bench'} → ${next ?? 'bench'}`
}

const selectCls =
  'min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white'
const labelCls = 'mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300'
const pageBtnCls =
  'min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'

interface Loaded {
  key: string
  rows: QueueHistoryRow[] | null
  error: string | null
}

// The History tab: queue changes as a log, filtered by agent and date range.
export default function HistoryList({ agents }: { agents: BoardAgent[] }) {
  const [userId, setUserId] = useState('')
  const [range, setRange] = useState<DateRange>('week')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [pageAt, setPageAt] = useState({ key: '', page: 1 })

  // Loading and the page number are derived from the request key, so the
  // effect only sets state from the promise callback.
  const key = `${userId}|${range}`
  const current = loaded?.key === key ? loaded : null
  const page = pageAt.key === key ? pageAt.page : 1

  useEffect(() => {
    let stale = false
    const { from, to } = rangeFor(range)
    getQueueHistoryAction({ ...(userId ? { userId } : {}), from, to })
      .then((res) => {
        if (stale) return
        setLoaded({ key, rows: res.error ? null : (res.data ?? []), error: res.error ?? null })
      })
      .catch(() => {
        if (!stale) setLoaded({ key, rows: null, error: 'Could not load queue history.' })
      })
    return () => {
      stale = true
    }
  }, [userId, range, key])

  const rows = current?.rows ?? null
  const error = current?.error ?? null
  const totalPages = rows ? Math.max(1, Math.ceil(rows.length / HISTORY_PAGE_SIZE)) : 1
  const pageRows = rows ? rows.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE) : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="history-agent" className={labelCls}>Filter by agent</label>
          <select id="history-agent" className={selectCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">All agents</option>
            {DEPARTMENTS.map((d) => {
              const inDept = agents.filter((a) => a.department === d)
              return (
                inDept.length > 0 && (
                  <optgroup key={d} label={d}>
                    {inDept.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </optgroup>
                )
              )
            })}
          </select>
        </div>
        <div>
          <span className={labelCls}>Date range</span>
          <div className="flex gap-2">
            {DATE_RANGES.map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={range === k}
                onClick={() => setRange(k)}
                className={`min-h-11 rounded-xl px-4 text-sm font-medium ${
                  range === k
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !rows ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No queue changes recorded for this period.</p>
      ) : (
        <>
          <ol className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
            {pageRows.map((r, i) => (
              <li key={i} className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-gray-500 dark:text-gray-400">{formatTime(r.effective_at)} · {formatDay(r.date)} · </span>
                <span className="font-medium text-gray-900 dark:text-white">{r.agent_name ?? 'Deleted user'}</span>
                {`: ${queueChangeText(r)}`}
                {r.reason && <span className="text-gray-500 dark:text-gray-400"> · {r.reason}</span>}
                {r.changed_by_name && <span className="text-gray-500 dark:text-gray-400"> · by {r.changed_by_name}</span>}
              </li>
            ))}
          </ol>
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-gray-500 dark:text-gray-400">
                Showing {(page - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(page * HISTORY_PAGE_SIZE, rows.length)} of {rows.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={pageBtnCls}
                  disabled={page <= 1}
                  onClick={() => setPageAt({ key, page: page - 1 })}
                >
                  Previous
                </button>
                <span className="text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span>
                <button
                  type="button"
                  className={pageBtnCls}
                  disabled={page >= totalPages}
                  onClick={() => setPageAt({ key, page: page + 1 })}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
