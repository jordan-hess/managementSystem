import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReviewForm from './ReviewForm'
import { SCORECARD_ITEMS, type ItemCode, type LegValue } from '@/lib/qa/scorecard'

jest.mock('animejs', () => ({ animate: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))
jest.mock('@/app/(app)/qa-reviews/actions', () => ({ createReviewAction: jest.fn(), updateReviewAction: jest.fn() }))
jest.mock('./CoachingActionsPanel', () => ({ __esModule: true, default: () => null }))
import { createReviewAction, updateReviewAction } from '@/app/(app)/qa-reviews/actions'

// The case B tests click 22 leg cells on an 11-row form; the 5 s default timed out once under a loaded machine.
jest.setTimeout(20000)

beforeAll(() => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as never
})

const settingsRows = [{ id: 's1', effectiveFrom: '1900-01-01', passMark: 75, excellentFrom: 85, criticalFailCap: 60 }]
const failureType = (id: string, name: string, item_code: 'C1' | 'C2' | 'C3' | null, requires_coaching = false) =>
  ({ id, name, description: null, item_code, requires_coaching, is_active: true, sort_order: 0, created_at: '', updated_at: '' })
const reasonTagTypes = [failureType('t1', 'Details requested publicly', 'C1')]
const coachingFlagTypes = [failureType('f1', 'Process breach', null, true)]
const categories = [
  { id: 'cat-net', department: 'Social', name: 'Network', is_active: true, sort_order: 1 },
  { id: 'cat-old', department: 'Social', name: 'Old thing', is_active: false, sort_order: 2 },
  { id: 'cat-ref', department: 'Billing', name: 'Refund', is_active: true, sort_order: 1 },
] as const
const agents = [{ id: 'a1', full_name: 'Ann Agent', team_leader_full_name: null, department: 'Billing', t2_team: null, team_department: null }]

const CODES = SCORECARD_ITEMS.map((d) => d.code)
const LEG_LABEL = { written: 'Written', call: 'Call' } as const

// One review item row as stored (string leg values), for `existing`.
const storedItem = (code: ItemCode, written: string | null, call: string | null) => ({
  id: code, review_id: 'r1', item_code: code, written_value: written, call_value: call,
  points_snapshot: 0, used: 0, earned: 0, comments: null, evidence: null,
})

function existingBoth() {
  return {
    id: 'r1', agent_id: 'a1', reviewer_id: 'rv', legs: 'both', department: 'Social',
    interaction_date: '2026-10-01', review_date: '2026-10-02', interaction_type: null, ticket_reference: null,
    customer_reference: null, call_reference: null, secondary_agent_name: null, raw_score: null, final_score: null,
    critical_fail: false, rating_label: '', closing_line: null, settings_id: 's1', fcr: null, root_cause_type_id: null,
    gap_identified: null, solution: null, overall_comments: null, agent_feedback: null, created_at: '', updated_at: '',
    items: CODES.map((c) => (c === 'Q3' ? storedItem(c, '4', 'na') : storedItem(c, c.startsWith('C') ? 'yes' : null, c.startsWith('C') ? 'yes' : null))),
    criticalFailures: [], auditLog: [], coachingActions: [],
  } as never
}

function setup(existing?: never) {
  render(
    <ReviewForm
      agents={agents} reviewerName="Rita" settingsRows={settingsRows}
      reasonTagTypes={reasonTagTypes as never} coachingFlagTypes={coachingFlagTypes as never}
      categories={categories as never} existing={existing} ownerCandidates={[]} canManageCoaching={false}
    />,
  )
}

const legsButton = (name: 'Written' | 'Call' | 'Both') =>
  within(screen.getByRole('group', { name: 'Legs on this case' })).getByRole('button', { name })
const legGroup = (code: ItemCode, leg: 'written' | 'call') => screen.getByRole('group', { name: `${code} ${LEG_LABEL[leg]}` })
const cell = (code: ItemCode, leg: 'written' | 'call', value: string) => within(legGroup(code, leg)).getByRole('button', { name: value })
const pick = (code: ItemCode, leg: 'written' | 'call', value: LegValue) =>
  userEvent.click(cell(code, leg, value === 'yes' ? 'Yes' : value === 'no' ? 'No' : value === 'na' ? 'N/A' : String(value)))
const pressed = (code: ItemCode, leg: 'written' | 'call') =>
  within(legGroup(code, leg)).queryAllByRole('button', { pressed: true }).map((b) => b.textContent)

const CASE_B: Record<ItemCode, [LegValue, LegValue]> = {
  C1: ['yes', 'yes'], C2: ['yes', 'na'], C3: ['yes', 'yes'],
  B1: ['yes', 'yes'], B2: ['yes', 'no'], B3: ['yes', 'na'], B4: ['yes', 'yes'],
  Q1: [4, 5], Q2: [3, 4], Q3: [5, 'na'], Q4: [4, 4],
}
async function enterCaseB() {
  await userEvent.click(legsButton('Both'))
  for (const code of CODES) {
    await pick(code, 'written', CASE_B[code][0])
    await pick(code, 'call', CASE_B[code][1])
  }
}

describe('ReviewForm legs selector', () => {
  beforeEach(() => jest.clearAllMocks())

  it('Written forces Call column to N/A and disables it', async () => {
    setup()
    await userEvent.click(legsButton('Written'))
    for (const code of CODES) {
      expect(pressed(code, 'call')).toEqual(['N/A'])
      for (const b of within(legGroup(code, 'call')).getAllByRole('button')) expect(b).toBeDisabled()
      expect(cell(code, 'written', 'N/A')).toBeEnabled()
    }
  })

  it('switching to Both clears only auto-set N/A', async () => {
    setup()
    await userEvent.click(legsButton('Written'))
    await pick('B3', 'written', 'na')
    await userEvent.click(legsButton('Both'))
    for (const code of CODES) expect(pressed(code, 'call')).toEqual([])
    expect(pressed('B3', 'written')).toEqual(['N/A'])
  })

  it('disables the agent select when editing', () => {
    setup(existingBoth())
    expect(document.getElementById('review-agent')).toBeDisabled()
  })

  it('editing a saved Both review keeps stored N/A', async () => {
    setup(existingBoth())
    expect(pressed('Q3', 'call')).toEqual(['N/A'])
    await userEvent.click(legsButton('Both'))
    expect(pressed('Q3', 'call')).toEqual(['N/A'])
    expect(pressed('Q3', 'written')).toEqual(['4'])
    expect(pressed('C1', 'call')).toEqual(['Yes'])
  })

  it('switching Both→Written with call entries asks for confirmation', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    setup()
    await userEvent.click(legsButton('Both'))
    await pick('C1', 'call', 'yes')
    await userEvent.click(legsButton('Written'))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(pressed('C1', 'call')).toEqual(['Yes'])
    expect(cell('C1', 'call', 'Yes')).toBeEnabled()

    confirm.mockReturnValue(true)
    await userEvent.click(legsButton('Written'))
    expect(pressed('C1', 'call')).toEqual(['N/A'])
    confirm.mockRestore()
  })

  it('does not ask for confirmation when the dropped leg is empty', async () => {
    const confirm = jest.spyOn(window, 'confirm')
    setup()
    await userEvent.click(legsButton('Both'))
    await pick('C1', 'written', 'yes')
    await userEvent.click(legsButton('Written'))
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})

describe('ReviewForm live summary', () => {
  it('live summary shows 85/100 — Excellent for case B', async () => {
    setup()
    await enterCaseB()
    expect(screen.getByText(/QA Score: 85\/100 — Excellent/)).toBeInTheDocument()
    expect(screen.getByText(/out of 100 points scored/)).toBeInTheDocument()
    expect(screen.getByText('Fail < 75 · Good 75–84.9 · Excellent ≥ 85 · any critical No = Fail (capped at 60)')).toBeInTheDocument()
  })

  it('shows capped from 85 when C1 call No', async () => {
    setup()
    await enterCaseB()
    await pick('C1', 'call', 'no')
    expect(screen.getByText(/QA Score: 60\/100 — Fail \(Critical\)/)).toBeInTheDocument()
    expect(screen.getByText(/\(capped from 85\)/)).toBeInTheDocument()
    expect(screen.getByText('Coaching session will be suggested')).toBeInTheDocument()
  })

  it('shows a blank score, not 0, when nothing is scored', () => {
    setup()
    expect(screen.getByText(/QA Score: —\/100/)).toBeInTheDocument()
    expect(screen.queryByText('Coaching session will be suggested')).not.toBeInTheDocument()
  })

  it('renders the Q4 hint', () => {
    setup()
    expect(screen.getByText('(tone, warmth, pace, dead air/holds, not speaking over, response times)')).toBeInTheDocument()
  })
})

describe('ReviewForm rows and save', () => {
  beforeEach(() => jest.clearAllMocks())

  it('reason tags appear only after a C leg is No', async () => {
    setup()
    await userEvent.click(legsButton('Both'))
    expect(screen.queryByRole('checkbox', { name: /Details requested publicly/ })).not.toBeInTheDocument()
    await pick('C1', 'written', 'no')
    await userEvent.click(screen.getByRole('checkbox', { name: /Details requested publicly/ }))
    expect(screen.getByRole('checkbox', { name: /Details requested publicly/ })).toBeChecked()
    // Unticking the only No leg hides and drops the tag.
    await pick('C1', 'written', 'no')
    expect(pressed('C1', 'written')).toEqual([])
    expect(screen.queryByRole('checkbox', { name: /Details requested publicly/ })).not.toBeInTheDocument()
    await pick('C1', 'call', 'no')
    expect(screen.getByRole('checkbox', { name: /Details requested publicly/ })).not.toBeChecked()
  })

  it('pre-fills Department from the agent', async () => {
    setup()
    await userEvent.selectOptions(document.getElementById('review-agent')!, 'a1')
    expect(document.getElementById('review-department')).toHaveValue('Billing')
  })

  it('shows field errors and does not save an incomplete review', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /submit qa/i }))
    expect(screen.getByText('Please select an agent.')).toBeInTheDocument()
    expect(document.getElementById('review-legs')).toHaveAttribute('aria-invalid', 'true')
    expect(createReviewAction).not.toHaveBeenCalled()
  })

  it('submits SaveReviewInput with toDbLeg-compatible values', async () => {
    ;(createReviewAction as jest.Mock).mockResolvedValue({ id: 'new' })
    setup()
    await userEvent.selectOptions(document.getElementById('review-agent')!, 'a1')
    await userEvent.click(legsButton('Written'))
    for (const code of ['C1', 'C2', 'C3'] as ItemCode[]) await pick(code, 'written', 'yes')
    await pick('Q2', 'written', 3)
    await userEvent.click(screen.getByRole('button', { name: /submit qa/i }))
    expect(createReviewAction).toHaveBeenCalledTimes(1)
    const payload = (createReviewAction as jest.Mock).mock.calls[0][0]
    expect(payload.legs).toBe('written')
    expect(payload.department).toBe('Billing')
    expect(payload.items.length).toBe(11)
    expect(payload.items.find((i: { code: string }) => i.code === 'C1')).toEqual({ code: 'C1', written: 'yes', call: 'na', comments: null, evidence: null })
    expect(payload.items.find((i: { code: string }) => i.code === 'Q2')).toMatchObject({ written: 3, call: 'na' })
    expect(payload.items.find((i: { code: string }) => i.code === 'B1')).toMatchObject({ written: null, call: 'na' })
  })

  it('shows a server error in the banner', async () => {
    ;(createReviewAction as jest.Mock).mockResolvedValue({ error: 'Could not save review.' })
    setup()
    await userEvent.selectOptions(document.getElementById('review-agent')!, 'a1')
    await userEvent.click(legsButton('Written'))
    for (const code of ['C1', 'C2', 'C3'] as ItemCode[]) await pick(code, 'written', 'yes')
    await userEvent.click(screen.getByRole('button', { name: /submit qa/i }))
    expect(await screen.findByText('Could not save review.')).toBeInTheDocument()
  })
})

describe('ReviewForm root cause and category', () => {
  const optionLabels = (id: string) => Array.from(document.querySelectorAll(`#${id} option`)).map((o) => o.textContent)

  it('shows the coaching-only types as the Root Causes checklist, with no Root Cause dropdown', () => {
    setup()
    expect(screen.getByText('Root Causes')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Process breach/ })).toBeInTheDocument()
    expect(document.getElementById('review-root-cause')).toBeNull()
    expect(screen.queryByTestId('legacy-root-cause')).toBeNull()
  })

  it("shows a review's old dropdown value read-only and keeps it on save", async () => {
    const complete = CODES.map((c) => (c.startsWith('Q') ? storedItem(c, '5', '5') : storedItem(c, 'yes', 'yes')))
    const existing = { ...(existingBoth() as object), items: complete, root_cause_type_id: 't1' } as never
    ;(updateReviewAction as jest.Mock).mockResolvedValue({})
    setup(existing)
    expect(screen.getByTestId('legacy-root-cause')).toHaveTextContent('Details requested publicly')
    await userEvent.click(screen.getByRole('button', { name: /submit qa/i }))
    expect(updateReviewAction).toHaveBeenCalledWith(expect.objectContaining({ rootCauseTypeId: 't1' }))
  })

  it("lists only the department's active categories and clears the pick when the department changes", async () => {
    setup()
    const departmentSelect = document.getElementById('review-department')!
    expect(screen.getByLabelText('Query / Category')).toBeDisabled()

    await userEvent.selectOptions(departmentSelect, 'Social')
    expect(optionLabels('review-category')).toEqual(['Select category...', 'Network'])
    await userEvent.selectOptions(screen.getByLabelText('Query / Category'), 'cat-net')

    await userEvent.selectOptions(departmentSelect, 'Billing')
    expect(screen.getByLabelText('Query / Category')).toHaveValue('')
    expect(optionLabels('review-category')).toEqual(['Select category...', 'Refund'])
  })

  it("keeps a review's own retired category selectable", () => {
    setup({ ...(existingBoth() as object), category_id: 'cat-old' } as never)
    expect(screen.getByLabelText('Query / Category')).toHaveValue('cat-old')
    expect(optionLabels('review-category')).toEqual(['Select category...', 'Network', 'Old thing (retired)'])
  })
})
