import { reviewsToCsv, itemValue, REVIEWS_CSV_HEADERS, type ExportReviewRow } from './reviewsCsv'

const row = (over: Partial<ExportReviewRow> = {}): ExportReviewRow => ({
  reviewer_name: 'Rita Reviewer', interaction_date: '2026-11-03', review_date: '2026-11-04', agent_name: 'Ann Agent',
  department: 'Social', ticket_reference: 'https://x.com/post/1', call_reference: null, category_name: 'Network',
  legs: 'written',
  items: [
    { item_code: 'C1', written_value: 'yes', call_value: null, comments: 'Verified' },
    { item_code: 'B2', written_value: 'no', call_value: null, comments: null },
    { item_code: 'Q4', written_value: '3', call_value: null, comments: 'Flat tone' },
  ],
  root_causes: [{ name: 'Communication', notes: 'Apologise for the inconvenience' }],
  fcr: 'na', closing_line: 'No', legacy_root_cause_name: null, gap_identified: null, overall_comments: 'Good effort',
  ...over,
})

const split = (csv: string) => csv.split('\r\n').map((l) => l.split(';'))

describe('reviewsToCsv', () => {
  it('uses the QA capture sheet column layout', () => {
    expect(REVIEWS_CSV_HEADERS.slice(0, 9)).toEqual([
      'Reviewer / QA', 'Interaction Date', 'Date Reviewed', 'Agent', 'Department',
      'Ticket ID / Post Link', 'Call ID / Reference', 'Query / Category', 'C1 – Verification & data protection',
    ])
    expect(REVIEWS_CSV_HEADERS.slice(-7)).toEqual(['Coaching Flags', 'Notes (required)', 'FCR', 'Closing Line', 'Root Cause', 'Gap Identified', 'Overall comments'])
    expect(REVIEWS_CSV_HEADERS).toHaveLength(8 + 11 * 2 + 7)
  })

  it('writes one row per review with item values, comments and root causes', () => {
    const [, cells] = split(reviewsToCsv([row()]))
    const at = (h: string) => cells[REVIEWS_CSV_HEADERS.indexOf(h)]
    expect(at('Reviewer / QA')).toBe('Rita Reviewer')
    expect(at('Department')).toBe('Social Media')
    expect(at('C1 – Verification & data protection')).toBe('Yes')
    expect(cells[REVIEWS_CSV_HEADERS.indexOf('C1 – Verification & data protection') + 1]).toBe('Verified')
    expect(at('B2 – Verbatim closing question')).toBe('No')
    expect(at('Q4 – Communication, Empathy & Conversation Control')).toBe('3')
    expect(at('C2 – Promises kept')).toBe('')
    expect(at('Coaching Flags')).toBe('Communication')
    expect(at('Notes (required)')).toBe('Apologise for the inconvenience')
    expect(at('FCR')).toBe('N/A')
    expect(at('Closing Line')).toBe('No')
    expect(at('Root Cause')).toBe('')
    expect(cells).toHaveLength(REVIEWS_CSV_HEADERS.length)
  })

  it('joins several root causes and fills the legacy Root Cause column', () => {
    const csv = reviewsToCsv([row({
      root_causes: [{ name: 'Communication', notes: 'a' }, { name: 'Knowledge Gap', notes: 'b' }],
      legacy_root_cause_name: 'Process breach',
    })])
    const [, cells] = split(csv)
    expect(cells[REVIEWS_CSV_HEADERS.indexOf('Coaching Flags')]).toBe('Communication, Knowledge Gap')
    expect(cells[REVIEWS_CSV_HEADERS.indexOf('Notes (required)')]).toBe('a | b')
    expect(cells[REVIEWS_CSV_HEADERS.indexOf('Root Cause')]).toBe('Process breach')
  })

  it('quotes values containing the separator, quotes or line breaks', () => {
    const csv = reviewsToCsv([row({ overall_comments: 'Said "sorry"; then\nclosed' })])
    expect(csv.endsWith('"Said ""sorry""; then\nclosed"')).toBe(true)
  })
})

describe('itemValue', () => {
  const item = { item_code: 'B2' as const, written_value: 'yes', call_value: 'no', comments: null }
  it('shows the one leg used on a single-leg review', () => {
    expect(itemValue('written', item)).toBe('Yes')
    expect(itemValue('call', item)).toBe('No')
  })
  it('labels both legs on a two-leg review', () => {
    expect(itemValue('both', item)).toBe('W: Yes | C: No')
    expect(itemValue('both', { ...item, call_value: 'na' })).toBe('W: Yes | C: N/A')
    expect(itemValue('both', { ...item, call_value: null })).toBe('W: Yes | C: —')
    expect(itemValue('both', { ...item, written_value: null, call_value: null })).toBe('')
  })
})
