import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssignShiftModal from './AssignShiftModal'

jest.mock('@/app/(app)/roster/actions', () => ({ assignShiftOverridesAction: jest.fn() }))
import { assignShiftOverridesAction } from '@/app/(app)/roster/actions'

const templates = [{ id: 's1', name: 'Day', start_time: '08:00:00', end_time: '17:00:00', work_days: [1, 2, 3, 4, 5] }] as never
const el = (id: string) => document.getElementById(id) as HTMLElement
const assign = () => screen.getByRole('button', { name: /assign shift/i })

function setup() {
  render(<AssignShiftModal open onClose={jest.fn()} onSuccess={jest.fn()} profileId="p1" profileName="Pat" shiftTemplates={templates} currentUserId="u1" />)
}

describe('AssignShiftModal field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under the shift picker and the day selector together', async () => {
    setup()
    await userEvent.click(assign())
    expect(el('assign-shift-shift')).toHaveAttribute('aria-invalid', 'true')
    expect(el('assign-shift-shift').className).toContain('border-red-500')
    expect(screen.getByText('Please select a shift.')).toBeInTheDocument()
    expect(el('assign-shift-days')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Select at least one day.')).toBeInTheDocument()
    expect(assignShiftOverridesAction).not.toHaveBeenCalled()
  })

  it('picking a shift clears the shift error and the pre-filled days clear the days error', async () => {
    setup()
    await userEvent.click(assign())
    await userEvent.selectOptions(el('assign-shift-shift'), 's1')
    expect(screen.queryByText('Please select a shift.')).not.toBeInTheDocument()
    expect(screen.queryByText('Select at least one day.')).not.toBeInTheDocument()
  })

  it('rejects a week start that is not a Monday under the date input', async () => {
    setup()
    await userEvent.selectOptions(el('assign-shift-shift'), 's1')
    fireEvent.change(el('assign-shift-week_start'), { target: { value: '2030-01-08' } })
    await userEvent.click(assign())
    expect(el('assign-shift-week_start')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Week start must be a Monday.', { selector: 'p[role="alert"]' })).toBeInTheDocument()
  })

  it('shows a server error in the top banner', async () => {
    ;(assignShiftOverridesAction as jest.Mock).mockResolvedValue({ error: 'Could not assign shift.' })
    setup()
    await userEvent.selectOptions(el('assign-shift-shift'), 's1')
    await userEvent.click(assign())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not assign shift.')
    expect(alert).not.toHaveAttribute('id')
  })
})
