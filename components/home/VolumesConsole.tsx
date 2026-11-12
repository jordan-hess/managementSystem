'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type BaseTickContentProps } from 'recharts'
import { VolumeSeries } from '@/lib/home/volumes'

// A custom tick component (Tailwind dark: classes) instead of tick={{ fill: 'currentColor' }} —
// that relied on the tick <text>'s inherited `color`, which never actually resolved to this
// app's dark: text-gray-400 (SVG text doesn't reliably inherit `color` from a parent className
// the way regular DOM does), so axis labels stayed black regardless of theme. Same root cause
// and fix as VolumeTooltip above.
function AxisTick({ x, y, textAnchor, payload }: BaseTickContentProps) {
  return (
    <text x={x} y={y} dy={4} textAnchor={textAnchor} className="fill-gray-500 dark:fill-white" fontSize={11}>
      {payload.value}
    </text>
  )
}

// A custom content component (Tailwind dark: classes) instead of Tooltip's contentStyle —
// contentStyle is a plain inline style object, which can't react to the .dark ancestor
// class the rest of this app uses for theming, so it was stuck white-background/black-text
// even in dark mode.
function VolumeTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-900 dark:text-white">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-gray-500 dark:text-gray-400">
          {p.name} : <span className="font-medium text-gray-900 dark:text-white">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

interface Props {
  series: VolumeSeries[]
}

// How many panels show per page, driven by the console's own rendered width
// rather than a viewport breakpoint — it sits inside a dashboard grid cell
// whose width varies by layout, not by screen size (same reasoning as the
// @container use elsewhere in this file). A plain Tailwind breakpoint can't
// react to that, so a ResizeObserver measures the actual container instead.
const WIDTH_TIERS: { minWidth: number; count: number }[] = [
  { minWidth: 1100, count: 4 },
  { minWidth: 560, count: 2 },
  { minWidth: 0, count: 1 },
]

function resolveVisibleCount(width: number): number {
  return WIDTH_TIERS.find(t => width >= t.minWidth)?.count ?? 1
}

// Cycled by position, not matched to category name, so a newly added category
// still gets a distinct accent without any code change.
const ACCENTS = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#ec4899', '#6366f1']

function VolumePanel({ series, accent }: { series: VolumeSeries; accent: string }) {
  return (
    <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
          <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{series.categoryName} · monthly</span>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">requests vs completed</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series.points} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-100 dark:stroke-gray-800" />
            <XAxis dataKey="month" tick={AxisTick} axisLine={false} tickLine={false} />
            <YAxis tick={AxisTick} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={VolumeTooltip} cursor={{ fill: accent, fillOpacity: 0.08 }} />
            <Bar dataKey="requested" name="requested" fill="transparent" stroke={accent} strokeWidth={1.5} radius={[3, 3, 0, 0]} />
            <Bar dataKey="completed" name="completed" fill={accent} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: accent }} /> completed</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border" style={{ borderColor: accent }} /> requested</span>
      </div>
    </div>
  )
}

export default function VolumesConsole({ series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(2)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0
      setVisibleCount(resolveVisibleCount(width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const totalPages = Math.max(1, Math.ceil(series.length / visibleCount))
  // Derived, not stored — if visibleCount shrinks the page count, this just
  // clamps for this render rather than needing a corrective effect.
  const clampedPage = Math.min(page, totalPages - 1)
  const visible = series.slice(clampedPage * visibleCount, clampedPage * visibleCount + visibleCount)

  if (series.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        No case categories yet — volumes will appear here once categories are set up in Follow-ups.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={clampedPage === 0}
          aria-label="Previous categories"
          className="shrink-0 p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Capped at 2 columns, driven by the ResizeObserver above — not a
            Tailwind breakpoint, since this console's width comes from its
            dashboard grid cell, not the viewport (see WIDTH_TIERS above).
            At the 4-visible tier this wraps into 2 rows of 2 instead of one
            row of 4; at 2-visible it's a single row of 2 as before. */}
        <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(visibleCount, 2)}, minmax(0, 1fr))` }}>
          {visible.map((s, i) => (
            <VolumePanel key={s.categoryId} series={s} accent={ACCENTS[(clampedPage * visibleCount + i) % ACCENTS.length]} />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          disabled={clampedPage >= totalPages - 1}
          aria-label="Next categories"
          className="shrink-0 p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPage(i)}
            aria-label={`Go to page ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === clampedPage ? 'w-4 bg-blue-500' : 'w-1.5 bg-gray-300 dark:bg-gray-700'}`}
          />
        ))}
      </div>
    </div>
  )
}
