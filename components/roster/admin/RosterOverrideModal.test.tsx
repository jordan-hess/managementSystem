import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RosterOverrideModal from './RosterOverrideModal'

jest.mock('@/app/(app)/roster/actions', () => ({ upsertRosterOverrideAction: jest.fn() }))
import { upsertRosterOverrideAction } from '@/app/(app)/roster/actions'

const templates = [{ id: 's1', name: 'Day', start_time: '08:00:00', end_time: '17:00:00', work_days: [1, 2, 3, 4, 5] }] as never
const el = (id: string) => document.getElementById(id) as HTMLElement
const apply = () => screen.getByRole('button', { name: /apply override/i })

function setup() {
  render(<RosterOverrideModal open onClose={jest.fn()} onSuccess={jest.fn()} profileId="p1" profileName="Pat" date="2030-01-07" existing={null} shiftTemplates={templates} currentUserId="u1" />)
}

describe('RosterOverrideModal errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows a red error under the template picker for a swap-in with no template', async () => {
    setup()
    await userEvent.click(screen.getByRole('radio', { name: /swap in/i }))
    await userEvent.click(apply())
    expect(el('override-template')).toHaveAttribute('aria-invalid', 'true')
    expect(el('override-template').className).toContain('border-red-500')
    expect(screen.getByText('Please select a shift template for this override type.')).toHaveAttribute('id', 'override-template-error')
    expect(upsertRosterOverrideAction).not.toHaveBeenCalled()
  })

  it('clears the error once a template is picked', async () => {
    setup()
    await userEvent.click(screen.getByRole('radio', { name: /swap in/i }))
    await userEvent.click(apply())
    await userEvent.selectOptions(el('override-template'), 's1')
    expect(screen.queryByText('Please select a shift template for this override type.')).not.toBeInTheDocument()
  })

  it('drops the template error when the type changes to one that needs no template', async () => {
    setup()
    await userEvent.click(screen.getByRole('radio', { name: /extra shift/i }))
    await userEvent.click(apply())
    await userEvent.click(screen.getByRole('radio', { name: /force off/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a server error in the top banner', async () => {
    ;(upsertRosterOverrideAction as jest.Mock).mockResolvedValue({ error: 'Could not save override.' })
    setup()
    await userEvent.click(apply())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not save override.')
    expect(alert).not.toHaveAttribute('id')
  })
})
