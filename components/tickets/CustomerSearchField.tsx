'use client'

import { useEffect, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { searchCustomersAction } from '@/lib/customers/search'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'

export interface CustomerOption { id: string; name: string; phone: string }

interface Props {
  /** The preloaded list, used only to resolve the selected customer's "name — phone" chip. Customers are chosen by search. */
  customers: CustomerOption[]
  value: string
  onChange: (customerId: string) => void
  label?: string
  required?: boolean
  disabled?: boolean
  /** An extra always-available choice shown as a small button under the search box — e.g. AssignFollowupModal's "+ New Customer" sentinel. Clicking it just calls onChange(value) like any real customer id. */
  extraOption?: { value: string; label: string }
  /** How to render the selected chip when `value` isn't one of `customers` (e.g. the extraOption's sentinel value) — return null to fall through to the plain dash. */
  selectedLabelOverride?: (value: string) => string | null
  /** Id for the search input (also the base of the error message's id) and an optional error — outlines the input red and shows the message beneath. */
  id?: string
  error?: string
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

/**
 * Debounced customer search (name/phone/email/IMSI, via the same
 * searchCustomersAction the "+ New Ticket" flow already uses — see
 * CreateTicketOrchestrator.tsx). Search-only: the preloaded `customers` list
 * just resolves the selected customer's chip, it is not offered as a dropdown.
 * Once a customer is picked, shows a resolved "name — phone" chip with a
 * "Change" link back to search, the same shape every one of these forms
 * already used for its page-level "selected customer" banner.
 */
export default function CustomerSearchField({
  customers, value, onChange, label = 'Customer', required, disabled, extraOption, selectedLabelOverride, id, error,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerOption[] | null>(null)
  // The query the above `results` actually belong to — compared against the
  // CURRENT query to derive `searching`, rather than a synchronous
  // setSearching(true) at the top of the effect below (flagged by
  // react-hooks/set-state-in-effect; see LeadOpsDataProvider.tsx's resolvedShiftLoading
  // for the same pattern elsewhere in this codebase).
  const [resultsForQuery, setResultsForQuery] = useState('')
  const trimmedQuery = query.trim()
  const searching = trimmedQuery !== '' && resultsForQuery !== trimmedQuery

  useEffect(() => {
    if (!trimmedQuery) return
    let cancelled = false
    const t = setTimeout(async () => {
      const r = await searchCustomersAction(trimmedQuery)
      if (cancelled) return
      if (!r.error) setResults(r.data ?? [])
      setResultsForQuery(trimmedQuery)
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [trimmedQuery])

  // The option the user just picked from search results; it may not be in the
  // preloaded `customers` (e.g. created after page load), so keep it to resolve the chip.
  const [pickedFromSearch, setPickedFromSearch] = useState<CustomerOption | null>(null)
  // Drop the remembered pick when the value is cleared from outside.
  if (!value && pickedFromSearch) setPickedFromSearch(null)
  const selected = customers.find((c) => c.id === value) ?? (pickedFromSearch?.id === value ? pickedFromSearch : null)
  const overrideLabel = !selected && value ? (selectedLabelOverride?.(value) ?? null) : null

  function pick(id: string, option?: CustomerOption) {
    setPickedFromSearch(option ?? null)
    onChange(id)
    setQuery('')
    setResults(null)
  }

  return (
    <div>
      {label && <label className={labelCls}>{label}{required && ' *'}</label>}
      {disabled ? (
        <p className="text-sm text-gray-900 dark:text-white px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          {selected ? `${selected.name} — ${selected.phone}` : (overrideLabel ?? '—')}
        </p>
      ) : selected || overrideLabel ? (
        <div className="flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800">
          <span className="text-gray-900 dark:text-white">{selected ? `${selected.name} — ${selected.phone}` : overrideLabel}</span>
          <button type="button" className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0 ml-2" onClick={() => { setPickedFromSearch(null); onChange('') }}>
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id={id} className={`${fieldInputClass(inputCls, !!error)} pl-9`} {...(id ? fieldA11y(id, error) : {})}
              placeholder="Search by name, phone, email, or IMSI…" value={query} onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {(query.trim() || searching) && (
            <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
              {searching && (
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />Searching…
                </div>
              )}
              {!searching && results && results.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600">No matches.</div>
              )}
              {!searching && results?.map((c) => (
                <button key={c.id} type="button" className="block w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => pick(c.id, { id: c.id, name: c.name, phone: c.phone })}>
                  {c.name} — {c.phone}
                </button>
              ))}
            </div>
          )}
          {extraOption && (
            <button
              type="button"
              className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => pick(extraOption.value)}
            >
              {extraOption.label}
            </button>
          )}
          {id && <FieldError id={id} message={error} />}
        </div>
      )}
    </div>
  )
}
