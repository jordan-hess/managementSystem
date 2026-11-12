import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WarningModal from './WarningModal'

jest.mock('@/app/(app)/qa-reviews/warningsActions', () => ({ createWarningAction: jest.fn(), updateWarningAction: jest.fn() }))
import { createWarningAction } from '@/app/(app)/qa-reviews/warningsActions'

const candidates = [{ id: 'a1', full_name: 'Ann Agent' }] as never
const el = (id: string) => document.getElementById(id) as HTMLElement
const issue = () => screen.getByRole('button', { name: /issue warning/i })

function setup() {
  render(<WarningModal open onClose={jest.fn()} editing={null} targetCandidates={candidates} currentUserId="u1" onSaved={jest.fn()} />)
}

describe('WarningModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under the target, reason and next steps together', async () => {
    setup()
    await userEvent.click(issue())
    for (const [id, msg] of [
      ['warning-target', 'Please select who this warning is for.'],
      ['warning-reason', 'Reason is required.'],
      ['warning-next_steps', 'Next steps are required.'],
    ]) {
      expect(el(id)).toHaveAttribute('aria-invalid', 'true')
      expect(el(id).className).toContain('border-red-500')
      expect(screen.getByText(msg)).toBeInTheDocument()
    }
    expect(createWarningAction).not.toHaveBeenCalled()
  })

  it('clears only the edited field\'s error', async () => {
    setup()
    await userEvent.click(issue())
    await userEvent.selectOptions(el('warning-target'), 'a1')
    expect(screen.queryByText('Please select who this warning is for.')).not.toBeInTheDocument()
    expect(screen.getByText('Reason is required.')).toBeInTheDocument()
  })

  it('shows a thrown server error in the top banner', async () => {
    ;(createWarningAction as jest.Mock).mockRejectedValue(new Error('Could not issue warning.'))
    setup()
    await userEvent.selectOptions(el('warning-target'), 'a1')
    await userEvent.type(el('warning-reason'), 'Late')
    await userEvent.type(el('warning-next_steps'), 'Be on time')
    await userEvent.click(issue())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not issue warning.')
    expect(alert).not.toHaveAttribute('id')
  })
})
