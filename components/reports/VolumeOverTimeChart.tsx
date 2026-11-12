'use client'

import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, type TooltipContentProps, type BaseTickContentProps } from 'recharts'
import { VolumePoint } from '@/lib/reports/volumeOverTime'
import { Granularity } from '@/lib/reports/volumeOverTime'
import { useReportParams } from './useReportParams'
import { cardCls, cardPad, sectionTitleCls, ACCENTS } from './theme'

// Same theme-aware tick/tooltip pattern as VolumesConsole.tsx — SVG <text>
// doesn't inherit CSS `color`, so a plain tick={{fill:'currentColor'}} or
// Tooltip contentStyle stays black in dark mode; Tailwind dark: classes on a
// custom component are the only fix that actually reacts to the .dark class.
function AxisTick({ x, y, textAnchor, payload }: BaseTickContentProps) {
  return (
    <text x={x} y={y} dy={4} textAnchor={textAnchor} className="fill-gray-500 dark:fill-white" fontSize={11}>
      {payload.value}
    </text>
  )
}

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

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

interface Props {
  points: VolumePoint[]
  granularity: Granularity
}

export default function VolumeOverTimeChart({ points, granularity }: Props) {
  const { setParams } = useReportParams()

  return (
    <div className={`${cardCls} ${cardPad}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={sectionTitleCls}>Volume Over Time</span>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {GRANULARITIES.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setParams({ granularity: g.value })}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                granularity === g.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72">
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No ticket volume in this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-100 dark:stroke-gray-800" />
              <XAxis dataKey="bucket" tick={AxisTick} axisLine={false} tickLine={false} />
              <YAxis tick={AxisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={VolumeTooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="total" name="Total" stroke={ACCENTS.total} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="t2" name="T2 Ops" stroke={ACCENTS.t2} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="social" name="Social" stroke={ACCENTS.social} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
