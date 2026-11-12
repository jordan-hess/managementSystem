'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

/**
 * Shared URL-param read/write for every report filter control (FilterBar,
 * PeriodPicker, T2QueueBreakdownTabs) — same push-based pattern as
 * TicketsPageClient's clearParams, generalized to set-or-clear any number of
 * params in one router.push so a control that invalidates a downstream
 * param (e.g. changing Team clears Queue) does it atomically, never as two
 * navigations.
 */
export function useReportParams() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParams(updates: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === undefined || value === '') params.delete(key)
      else params.set(key, value)
    }
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname)
  }

  return { searchParams, setParams }
}
