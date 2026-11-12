import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachingActionsPanel from './CoachingActionsPanel'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/qa-reviews/coachingActions', () => ({ createCoachingActionAction: jest.fn(), updateCoachingActionAction: jest.fn() }))
import { createCoachingActionAction, updateCoachingActionAction } from '@/app/(app)/qa-reviews/coachingActions'

const owners = [{ id: 'o1', full_name: 'Olly' }]
const action = { id: 'ca1', category: 'Tone', required_action: 'Roleplay', notes: null, due_date: null, owner_id: 'o1', status: 'open', owner: { full_name: 'Olly' } }
const storedItem = (item_code: string, written_value: string | null, call_value: string | null) => ({
  id: item_code, review_id: 'r1', item_code, written_value, call_value, points_snapshot: 0, used: 0, earned: 0, comments: null, evidence: null,
})
const failureRow = (typeId: string, name: string, item_code: string | null, requires_coaching_snapshot: boolean) => ({
  id: `rcf-${typeId}`, review_id: 'r1', critical_failure_type_id: typeId, notes: null, requires_coaching_snapshot,
  created_by: null, created_at: '', critical_failure_type: { id: typeId, name, item_code },
})
const review = (over = {}) => ({ id: 'r1', legs: 'both', reviewer_id: '', items: [], criticalFailures: [], coachingActions: [], ...over }) as never
const el = (id: string) => document.getElementById(id) as HTMLElement

function setup(over = {}) {
  render(<CoachingActionsPanel review={review(over)} ownerCandidates={owners} canManage />)
}

describe('CoachingActionsPanel suggestions', () => {
  it('lists suggestion for C1 fail', () => {
    setup({ items: [storedItem('C1', 'yes', 'no'), storedItem('B1', 'yes', 'yes')] })
    expect(screen.getByText('Verification & data protection — Critical item failed')).toBeInTheDocument()
  })

  it('suggests coaching-only flags that require coaching, ignoring reason tags', () => {
    setup({
      items: [storedItem('C1', 'no', 'na')],
      criticalFailures: [failureRow('t1', 'Details requested publicly', 'C1', true), failureRow('f1', 'Process breach', null, true), failureRow('f2', 'Minor', null, false)],
    })
    expect(screen.getByText('Process breach — Critical failure: Process breach')).toBeInTheDocument()
    expect(screen.queryByText(/Details requested publicly/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Minor/)).not.toBeInTheDocument()
  })

  it('treats the unused leg as N/A on a single-leg review', () => {
    // A stray stored call 'no' on a written-only case must not count.
    setup({ legs: 'written', items: [storedItem('C1', 'yes', 'no')] })
    expect(screen.queryByText(/Critical item failed/)).not.toBeInTheDocument()
  })
})

describe('CoachingActionsPanel field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under category, required action and owner when creating with them empty', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /\+ new coaching action/i }))
    await userEvent.click(screen.getByRole('button', { name: /^create coaching action$/i }))
    for (const [id, msg] of [
      ['coaching-new-category', 'Category is required.'],
      ['coaching-new-required_action', 'Required action is required.'],
      ['coaching-new-owner', 'Owner is required.'],
    ]) {
      expect(el(id)).toHaveAttribute('aria-invalid', 'true')
      expect(el(id).className).toContain('border-red-500')
      expect(screen.getByText(msg)).toBeInTheDocument()
    }
    expect(createCoachingActionAction).not.toHaveBeenCalled()
  })

  it('clears only the edited field\'s error', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /\+ new coaching action/i }))
    await userEvent.click(screen.getByRole('button', { name: /^create coaching action$/i }))
    await userEvent.type(el('coaching-new-category'), 'Tone')
    expect(screen.queryByText('Category is required.')).not.toBeInTheDocument()
    expect(screen.getByText('Required action is required.')).toBeInTheDocument()
  })

  it('validates the edit form separately, with its own ids', async () => {
    setup({ coachingActions: [action] })
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await userEvent.clear(el('coaching-edit-category'))
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(el('coaching-edit-category')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Category is required.')).toHaveAttribute('id', 'coaching-edit-category-error')
    expect(updateCoachingActionAction).not.toHaveBeenCalled()
  })

  it('shows a server error in the banner', async () => {
    ;(createCoachingActionAction as jest.Mock).mockResolvedValue({ error: 'Could not create coaching action.' })
    setup({ reviewer_id: 'o1' })
    await userEvent.click(screen.getByRole('button', { name: /\+ new coaching action/i }))
    await userEvent.type(el('coaching-new-category'), 'Tone')
    await userEvent.type(el('coaching-new-required_action'), 'Roleplay')
    await userEvent.click(screen.getByRole('button', { name: /^create coaching action$/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not create coaching action.')
    expect(alert).not.toHaveAttribute('id')
  })
})
