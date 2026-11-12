import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { webcrypto } from 'node:crypto'
import OvertimeRequestForm from './OvertimeRequestForm'

jest.mock('animejs', () => ({ animate: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/roster/actions', () => ({ submitOvertimeRequest: jest.fn() }))
import { submitOvertimeRequest } from '@/app/(app)/roster/actions'

beforeAll(() => {
  if (!globalThis.crypto?.randomUUID) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
})

const profile = { full_name: 'Pat Smith' } as never
const submit = () => screen.getByRole('button', { name: /submit overtime request/i })
const rows = () => document.getElementById('overtime-rows') as HTMLElement
const firstDate = () => document.querySelector('input[type="date"]') as HTMLElement

function setup() {
  render(<OvertimeRequestForm profile={profile} userTeam={null} onSuccess={jest.fn()} />)
}

describe('OvertimeRequestForm errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('outlines the entries table and shows the message when no date is filled in', async () => {
    setup()
    await userEvent.click(submit())
    expect(rows()).toHaveAttribute('aria-invalid', 'true')
    expect(rows().className).toContain('border-red-500')
    expect(screen.getByText('Please add at least one date entry.')).toHaveAttribute('id', 'overtime-rows-error')
    expect(submitOvertimeRequest).not.toHaveBeenCalled()
  })

  it('clears the error once a date is entered', async () => {
    setup()
    await userEvent.click(submit())
    fireEvent.change(firstDate(), { target: { value: '2030-01-02' } })
    expect(screen.queryByText('Please add at least one date entry.')).not.toBeInTheDocument()
    expect(rows()).not.toHaveAttribute('aria-invalid')
  })

  const numbers = () => Array.from(document.querySelectorAll('input[type="number"]')) as HTMLElement[] // [year, ot1.5, ot2.0, night]

  it('rejects a year outside 2020-2099 under the year input (the old min/max)', async () => {
    setup()
    fireEvent.change(firstDate(), { target: { value: '2030-01-02' } })
    fireEvent.change(document.getElementById('overtime-year') as HTMLElement, { target: { value: '2150' } })
    await userEvent.click(submit())
    expect(document.getElementById('overtime-year')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a year between 2020 and 2099.')).toHaveAttribute('id', 'overtime-year-error')
    expect(submitOvertimeRequest).not.toHaveBeenCalled()
  })

  it('rejects negative overtime hours under the entries table (the old min=0)', async () => {
    setup()
    fireEvent.change(firstDate(), { target: { value: '2030-01-02' } })
    fireEvent.change(numbers()[1], { target: { value: '-4' } })
    await userEvent.click(submit())
    expect(rows()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Overtime hours must be 0 or more, in steps of 0.5.')).toBeInTheDocument()
    expect(submitOvertimeRequest).not.toHaveBeenCalled()
  })

  it('rejects hours that are not in steps of 0.5 (the old step)', async () => {
    setup()
    fireEvent.change(firstDate(), { target: { value: '2030-01-02' } })
    fireEvent.change(numbers()[3], { target: { value: '1.3' } })
    await userEvent.click(submit())
    expect(screen.getByText('Overtime hours must be 0 or more, in steps of 0.5.')).toBeInTheDocument()
  })

  it('shows a server error in the top banner', async () => {
    ;(submitOvertimeRequest as jest.Mock).mockResolvedValue({ error: 'Could not submit request.' })
    setup()
    fireEvent.change(firstDate(), { target: { value: '2030-01-02' } })
    await userEvent.click(submit())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not submit request.')
    expect(alert).not.toHaveAttribute('id')
  })
})
