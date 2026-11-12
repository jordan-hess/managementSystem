'use client'

import { RATING_NAMES, type Leg, type LegValue, type ScorecardItemDef } from '@/lib/qa/scorecard'
import type { QaCriticalFailureType } from '@/types'
import { fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'

export interface RowState {
  written: LegValue
  call: LegValue
  comments: string
  evidence: string
}

interface Props {
  def: ScorecardItemDef
  row: RowState
  /** Legs the reviewer can edit; the other leg is shown as forced N/A and disabled. */
  activeLegs: readonly Leg[]
  readOnly?: boolean
  /** Per-leg errors, keyed by leg (from `item_<code>_<leg>`). */
  errors: Partial<Record<Leg, string>>
  /** Called with the new value; clicking the selected value again clears it (null). */
  onLegChange: (leg: Leg, value: LegValue) => void
  onTextChange: (field: 'comments' | 'evidence', text: string) => void
  /** C rows only: this item's reason-tag types, shown while any leg is No. */
  reasonTagTypes?: QaCriticalFailureType[]
  selectedTags?: ReadonlySet<string>
  onToggleTag?: (typeId: string, checked: boolean) => void
  inputCls: string
  labelCls: string
}

const LEG_LABEL: Record<Leg, string> = { written: 'Written', call: 'Call' }
const YES_NO: { value: LegValue; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'N/A' },
]
const RATINGS: { value: LegValue; label: string }[] = [
  ...([0, 1, 2, 3, 4, 5] as const).map((r) => ({ value: r, label: String(r) })),
  { value: 'na', label: 'N/A' },
]

function buttonCls(selected: boolean, value: LegValue, wide: boolean): string {
  const size = wide ? 'px-3 h-9' : 'w-9 h-9'
  const tone = !selected
    ? 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:hover:bg-transparent'
    : value === 'na'
      ? 'bg-gray-600 border-gray-600 text-white'
      : value === 'no' || value === 0
        ? 'bg-red-600 border-red-600 text-white'
        : value === 'yes'
          ? 'bg-green-600 border-green-600 text-white'
          : 'bg-blue-600 border-blue-600 text-white'
  return `${size} rounded-lg text-sm font-semibold border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tone}`
}

export default function ScorecardRow({
  def, row, activeLegs, readOnly, errors, onLegChange, onTextChange,
  reasonTagTypes = [], selectedTags, onToggleTag, inputCls, labelCls,
}: Props) {
  const isQuality = def.section === 'quality'
  const options = isQuality ? RATINGS : YES_NO
  const hasNo = row.written === 'no' || row.call === 'no'
  const hasError = !!(errors.written || errors.call)

  return (
    <div
      id={`review-row_${def.code}`} data-testid="scorecard-row" data-item-code={def.code}
      className={`p-4 bg-white dark:bg-gray-900 rounded-xl shadow-sm border ${hasError ? 'border-red-500 dark:border-red-500' : 'border-gray-100 dark:border-gray-800'}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{def.code} · {def.label}</span>
          {def.hint && <span className="block text-xs text-gray-500 dark:text-gray-400">{def.hint}</span>}
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium px-2 py-0.5">
          {def.section === 'critical' ? 'Critical' : `${def.points} pts`}
        </span>
      </div>

      {!isQuality && (
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 mb-3">
          <p><span className="font-semibold text-gray-600 dark:text-gray-300">Yes when:</span> {def.yesWhen}</p>
          <p><span className="font-semibold text-gray-600 dark:text-gray-300">No when:</span> {def.noWhen}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {(['written', 'call'] as const).map((leg) => {
          const value = row[leg]
          const active = activeLegs.includes(leg)
          const id = `review-item_${def.code}_${leg}`
          return (
            <div key={leg}>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{LEG_LABEL[leg]}</p>
              <div id={id} role="group" aria-label={`${def.code} ${LEG_LABEL[leg]}`} {...fieldA11y(id, errors[leg])} className="flex flex-wrap items-center gap-1.5">
                {options.map((o) => {
                  const selected = value === o.value
                  return (
                    <button
                      key={o.label} type="button" aria-pressed={selected} disabled={readOnly || !active}
                      onClick={() => onLegChange(leg, selected ? null : o.value)}
                      className={buttonCls(selected, o.value, o.value === 'na' || !isQuality)}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
              {isQuality && typeof value === 'number' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                  <span className="font-semibold not-italic">{RATING_NAMES[value]}:</span> {def.anchors?.[value]}
                </p>
              )}
              <FieldError id={id} message={errors[leg]} />
            </div>
          )
        })}
      </div>

      {def.section === 'critical' && hasNo && reasonTagTypes.length > 0 && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40">
          <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1.5">Reason (optional)</p>
          <div className="space-y-1">
            {reasonTagTypes.map((t) => (
              <label key={t.id} className="flex items-start gap-2 text-sm text-gray-900 dark:text-white">
                <input
                  type="checkbox" className="mt-0.5" disabled={readOnly}
                  checked={!!selectedTags?.has(t.id)} onChange={(e) => onToggleTag?.(t.id, e.target.checked)}
                />
                <span>
                  {t.name}
                  {t.description && <span className="block text-xs text-gray-500 dark:text-gray-400">{t.description}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor={`review-comments_${def.code}`}>QA comment</label>
          <textarea id={`review-comments_${def.code}`} rows={2} value={row.comments} onChange={(e) => onTextChange('comments', e.target.value)} className={`${inputCls} resize-none`} disabled={readOnly} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`review-evidence_${def.code}`}>Evidence / examples</label>
          <textarea id={`review-evidence_${def.code}`} rows={2} value={row.evidence} onChange={(e) => onTextChange('evidence', e.target.value)} className={`${inputCls} resize-none`} disabled={readOnly} />
        </div>
      </div>
    </div>
  )
}
