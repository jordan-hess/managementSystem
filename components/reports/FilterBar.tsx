'use client'

import { RotateCcw } from 'lucide-react'
import { QUEUES } from '@/lib/t2/constants'
import { SOCIAL_QUEUES } from '@/lib/queues/constants'
import { FilterOptions } from '@/lib/reports/filterOptions'
import { FilterVisibility } from '@/lib/reports/filterVisibility'
import { useReportParams } from './useReportParams'

const CHANNEL_LABELS: Record<string, string> = {
  freescout: 'Freescout',
  whatsapp: 'WhatsApp',
  hellopeter: 'HelloPeter',
  mybroadband: 'MyBroadband',
  pissedcustomer: 'PissedCustomer',
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'escalated', label: 'Escalated' },
]

const selectCls = 'text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white'

interface Props {
  team: string
  queue: string
  issueType: string
  rootCause: string
  status: string
  filterOptions: FilterOptions
  visibility: FilterVisibility
}

export default function FilterBar({ team, queue, issueType, rootCause, status, filterOptions, visibility }: Props) {
  const { setParams } = useReportParams()

  const hasNonDefaultFilter = team !== 'all' || !!queue || !!issueType || !!rootCause || status !== 'all'

  const queueOptions = team === 't2' ? QUEUES : team === 'social' ? SOCIAL_QUEUES : [...QUEUES, ...SOCIAL_QUEUES]

  const primaryLabel = visibility.showIssueType ? 'Issue Type' : visibility.showSimType ? 'SIM Type' : visibility.showPortIssueType ? 'Port Issue Type' : null
  const primaryOptions = visibility.showIssueType ? filterOptions.issueTypes : visibility.showSimType ? filterOptions.simTypes : visibility.showPortIssueType ? filterOptions.portIssueTypes : []
  const secondaryLabel = visibility.showRootCause ? 'Root Cause' : visibility.showSwapReason ? 'Reason for Swap' : null
  const secondaryOptions = visibility.showRootCause ? filterOptions.rootCauses : visibility.showSwapReason ? filterOptions.swapReasons : []

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectCls} value={team} onChange={(e) => setParams({ team: e.target.value, queue: null, issueType: null, rootCause: null })}>
        <option value="all">All Teams</option>
        <option value="t2">T2 Ops</option>
        <option value="social">Social</option>
      </select>

      <select className={selectCls} value={queue} onChange={(e) => setParams({ queue: e.target.value || null, issueType: null, rootCause: null })}>
        <option value="">All Queues / Channels</option>
        {queueOptions.map((q) => (
          <option key={q} value={q}>{CHANNEL_LABELS[q] ?? q}</option>
        ))}
      </select>

      {primaryLabel && (
        <select className={selectCls} value={issueType} onChange={(e) => setParams({ issueType: e.target.value || null })}>
          <option value="">{primaryLabel}: All</option>
          {primaryOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      )}

      {secondaryLabel && (
        <select className={selectCls} value={rootCause} onChange={(e) => setParams({ rootCause: e.target.value || null })}>
          <option value="">{secondaryLabel}: All</option>
          {secondaryOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      )}

      <select className={selectCls} value={status} onChange={(e) => setParams({ status: e.target.value })}>
        {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      {hasNonDefaultFilter && (
        <button
          type="button"
          onClick={() => setParams({ team: null, queue: null, issueType: null, rootCause: null, status: null })}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-2"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset filters
        </button>
      )}
    </div>
  )
}
