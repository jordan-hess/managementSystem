import { DEPARTMENT_LABELS } from '@/lib/qa/constants'
import { SCORECARD_ITEMS, type ItemCode, type QaLegs } from '@/lib/qa/scorecard'
import type { Department } from '@/lib/departments'

// Per-review QA export — one row per review, in the column layout of the
// team's QA capture sheet. ';'-separated like the old overview export, which
// is what Excel expects in the South African locale.

const SEP = ';'

export interface ExportReviewItem {
  item_code: ItemCode
  written_value: string | null
  call_value: string | null
  comments: string | null
}

export interface ExportRootCause {
  name: string
  notes: string | null
}

export interface ExportReviewRow {
  reviewer_name: string
  interaction_date: string
  review_date: string
  agent_name: string
  department: Department
  ticket_reference: string | null
  call_reference: string | null
  category_name: string | null
  legs: QaLegs
  items: ExportReviewItem[]
  /** Ticked root causes (coaching-only critical failures), in display order. */
  root_causes: ExportRootCause[]
  fcr: 'yes' | 'no' | 'na' | null
  closing_line: 'Yes' | 'No' | 'NA' | null
  /** The old single Root Cause dropdown — only on reviews saved before it was removed. */
  legacy_root_cause_name: string | null
  gap_identified: string | null
  overall_comments: string | null
}

function cell(value: string | null): string {
  if (value === null) return ''
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const VALUE_LABELS: Record<string, string> = { yes: 'Yes', no: 'No', na: 'N/A' }

/** Yes / No / N/A, or a Q item's 0-5 score as-is. */
function legLabel(v: string | null): string {
  if (v === null || v === '') return ''
  return VALUE_LABELS[v] ?? v
}

/** A single-leg review shows that leg's answer; a two-leg one shows "W: Yes | C: No". */
export function itemValue(legs: QaLegs, item: ExportReviewItem | undefined): string {
  if (!item) return ''
  if (legs === 'written') return legLabel(item.written_value)
  if (legs === 'call') return legLabel(item.call_value)
  const w = legLabel(item.written_value)
  const c = legLabel(item.call_value)
  if (!w && !c) return ''
  return `W: ${w || '—'} | C: ${c || '—'}`
}

export const REVIEWS_CSV_HEADERS: string[] = [
  'Reviewer / QA', 'Interaction Date', 'Date Reviewed', 'Agent', 'Department',
  'Ticket ID / Post Link', 'Call ID / Reference', 'Query / Category',
  ...SCORECARD_ITEMS.flatMap((d) => [`${d.code} – ${d.label}`, 'QA comment']),
  'Coaching Flags', 'Notes (required)', 'FCR', 'Closing Line', 'Root Cause', 'Gap Identified', 'Overall comments',
]

export function reviewsToCsv(rows: ExportReviewRow[]): string {
  const lines = [REVIEWS_CSV_HEADERS.map(cell).join(SEP)]
  for (const r of rows) {
    const byCode = new Map(r.items.map((i) => [i.item_code, i]))
    const values: (string | null)[] = [
      r.reviewer_name, r.interaction_date, r.review_date, r.agent_name, DEPARTMENT_LABELS[r.department] ?? r.department,
      r.ticket_reference, r.call_reference, r.category_name,
      ...SCORECARD_ITEMS.flatMap((d) => [itemValue(r.legs, byCode.get(d.code)), byCode.get(d.code)?.comments ?? null]),
      r.root_causes.map((c) => c.name).join(', ') || null,
      r.root_causes.map((c) => c.notes?.trim()).filter(Boolean).join(' | ') || null,
      r.fcr ? VALUE_LABELS[r.fcr] : null,
      r.closing_line === 'NA' ? 'N/A' : r.closing_line,
      r.legacy_root_cause_name,
      r.gap_identified,
      r.overall_comments,
    ]
    lines.push(values.map(cell).join(SEP))
  }
  return lines.join('\r\n')
}
