'use client'

import { useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  formatDateKey,
  getBusinessToday,
  getMonthGridDays,
  isSameMonth,
  isToday,
} from '@/lib/roster/calendarUtils'

/**
 * Inclusive date-range picker for the Tickets filter bar.
 *
 * Presets sit alongside the grid rather than below it because the common
 * case on this page isn't "pick two arbitrary dates" — it's "this week" or
 * "last month". Making those one click keeps the calendar for the times a
 * specific span is actually needed.
 *
 * Follows the popover convention in components/layout/SettingsPopover.tsx
 * (a fixed full-screen click-catcher behind an absolutely-positioned panel)
 * and reuses lib/roster/calendarUtils.ts for every date calculation, so the
 * month grid here behaves exactly like the roster's.
 */

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** 'YYYY-MM-DD' -> local Date. Avoids new Date(str), which parses as UTC and can slip a day. */
function parseKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function shortLabel(key: string): string {
  const d = parseKey(key)
  if (!d) return ''
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
}

/** "1–30 Sep" when the months match, "28 Aug – 3 Sep" when they don't. */
function rangeLabel(from: string, to: string): string {
  if (!from && !to) return 'Any date'
  if (from && !to) return `From ${shortLabel(from)}`
  if (!from && to) return `Until ${shortLabel(to)}`
  const a = parseKey(from)
  const b = parseKey(to)
  if (!a || !b) return 'Any date'
  if (from === to) return shortLabel(from)
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${b.getDate()} ${b.toLocaleDateString('en-ZA', { month: 'short' })}`
  }
  return `${shortLabel(from)} – ${shortLabel(to)}`
}

interface Preset {
  label: string
  range: () => { from: string; to: string }
}

const PRESETS: Preset[] = [
  { label: 'Today', range: () => { const t = getBusinessToday(); return { from: formatDateKey(t), to: formatDateKey(t) } } },
  { label: 'Last 7 days', range: () => { const t = getBusinessToday(); return { from: formatDateKey(addDays(t, -6)), to: formatDateKey(t) } } },
  { label: 'Last 30 days', range: () => { const t = getBusinessToday(); return { from: formatDateKey(addDays(t, -29)), to: formatDateKey(t) } } },
  {
    label: 'This month',
    range: () => {
      const t = getBusinessToday()
      return { from: formatDateKey(new Date(t.getFullYear(), t.getMonth(), 1)), to: formatDateKey(t) }
    },
  },
  {
    label: 'Last month',
    range: () => {
      const t = getBusinessToday()
      return {
        from: formatDateKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        to: formatDateKey(new Date(t.getFullYear(), t.getMonth(), 0)),
      }
    },
  },
]

interface Props {
  /** 'YYYY-MM-DD' or ''. */
  from: string
  to: string
  onChange: (next: { from: string | null; to: string | null }) => void
}

export default function DateRangeCalendar({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const anchor = parseKey(from) ?? parseKey(to) ?? getBusinessToday()
  const [view, setView] = useState({ year: anchor.getFullYear(), month: anchor.getMonth() })

  const panelRef = useRef<HTMLDivElement>(null)

  // The one piece of motion here: the panel answering the click that opened
  // it. Same reduced-motion guard as the QA score meter in
  // components/qaReviews/ReviewForm.tsx.
  useEffect(() => {
    const node = panelRef.current
    if (!open || !node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    animate(node, { opacity: [0, 1], translateY: [-4, 0], duration: 140, ease: 'outQuad' })
  }, [open])

  // Escape closes, and abandons a half-made selection rather than applying it.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setPendingStart(null); setHovered(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function openPanel() {
    const a = parseKey(from) ?? parseKey(to) ?? getBusinessToday()
    setView({ year: a.getFullYear(), month: a.getMonth() })
    setPendingStart(null)
    setHovered(null)
    setOpen(true)
  }

  function pickDay(key: string) {
    // First click starts a range; second completes it, ordered so clicking
    // backwards still gives a valid span.
    if (!pendingStart) {
      setPendingStart(key)
      onChange({ from: key, to: null })
      return
    }
    const [start, end] = pendingStart <= key ? [pendingStart, key] : [key, pendingStart]
    onChange({ from: start, to: end })
    setPendingStart(null)
    setHovered(null)
    setOpen(false)
  }

  function applyPreset(preset: Preset) {
    const range = preset.range()
    onChange(range)
    setPendingStart(null)
    setOpen(false)
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  // While a range is half-made, the hovered day stands in for the end so the
  // span you're about to commit to is visible before you commit to it.
  const effectiveStart = pendingStart ?? from
  const effectiveEnd = pendingStart ? (hovered ?? pendingStart) : to
  const lo = effectiveStart && effectiveEnd ? (effectiveStart <= effectiveEnd ? effectiveStart : effectiveEnd) : effectiveStart
  const hi = effectiveStart && effectiveEnd ? (effectiveStart <= effectiveEnd ? effectiveEnd : effectiveStart) : effectiveEnd

  const days = getMonthGridDays(view.year, view.month)
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
  const hasRange = Boolean(from || to)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        title="Filter by the days a ticket was worked on"
        aria-expanded={open}
        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${
          hasRange
            ? 'border-blue-500 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
      >
        <CalendarDays className="w-4 h-4 shrink-0" />
        {rangeLabel(from, to)}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setPendingStart(null) }} />
          <div
            ref={panelRef}
            // w-max so the panel sizes to its content instead of being
            // squeezed by the filter bar; the viewport cap stops it running
            // off-screen when the trigger sits near the right edge.
            className="absolute left-0 mt-2 z-20 flex w-max max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="flex flex-col gap-0.5 p-2 border-r border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="text-left whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {p.label}
                </button>
              ))}
              {hasRange && (
                <button
                  type="button"
                  onClick={() => { onChange({ from: null, to: null }); setPendingStart(null); setOpen(false) }}
                  className="text-left whitespace-nowrap mt-1 px-3 py-1.5 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  title="Previous month"
                  className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap px-2">{monthLabel}</span>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  title="Next month"
                  className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Fixed 2.5rem tracks, not grid-cols-7. Tailwind's grid-cols-7
                  is repeat(7, minmax(0, 1fr)), and that minmax(0, …) lets a
                  track shrink below its own content — which collapsed the day
                  labels into "MoTuWeThFrSa" and crammed the numbers together. */}
              <div className="grid grid-cols-[repeat(7,2.5rem)] gap-1 mb-1">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500">{d}</div>
                ))}
              </div>

              <div
                className="grid grid-cols-[repeat(7,2.5rem)] gap-1"
                onMouseLeave={() => setHovered(null)}
              >
                {days.map((day) => {
                  const key = formatDateKey(day)
                  const outside = !isSameMonth(day, view.year, view.month)
                  const isStart = Boolean(lo) && key === lo
                  const isEnd = Boolean(hi) && key === hi
                  const inRange = Boolean(lo && hi) && key > (lo as string) && key < (hi as string)
                  const endpoint = isStart || isEnd

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => pickDay(key)}
                      onMouseEnter={() => setHovered(key)}
                      aria-label={day.toLocaleDateString('en-ZA', { dateStyle: 'full' })}
                      className={`h-9 w-full rounded-md text-sm transition-colors ${
                        endpoint
                          ? 'bg-blue-600 text-white font-semibold'
                          : inRange
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : outside
                              ? 'text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      } ${isToday(day) && !endpoint ? 'ring-1 ring-inset ring-blue-400 dark:ring-blue-500' : ''}`}
                    >
                      {day.getDate()}
                    </button>
                  )
                })}
              </div>

              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {pendingStart ? 'Pick the end of the range' : 'Shows tickets worked on in this range'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
