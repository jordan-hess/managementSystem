const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  days: string[]
  selected: string
  placedCounts: Record<string, number>
  onSelect: (d: string) => void
}

export default function DayPicker({ days, selected, placedCounts, onSelect }: Props) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, i) => {
        const placed = placedCounts[day] ?? 0
        const active = day === selected
        return (
          <button
            key={day}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(day)}
            className={`flex min-h-11 flex-col items-center justify-center rounded-xl border px-1 py-2 text-xs font-medium ${
              active
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            <span>{WEEKDAYS[i]}</span>
            <span className={active ? 'text-white' : 'text-gray-500 dark:text-gray-400'}>
              {placed > 0 ? `${placed} placed` : day.slice(8)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
