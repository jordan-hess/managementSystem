import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsManager from './SettingsManager'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
jest.mock('@/app/(app)/qa-reviews/settingsActions', () => ({
  saveSettingsAction: jest.fn(),
  countReviewsAffectedBySettings: jest.fn(),
}))
import { saveSettingsAction, countReviewsAffectedBySettings } from '@/app/(app)/qa-reviews/settingsActions'

const history = [
  { id: 's2', pass_mark: 75, excellent_from: 92, critical_fail_cap: 40, effective_from: '2026-11-01', created_by: 'u1', created_by_name: 'Rita', created_at: '', updated_at: '' },
  { id: 's1', pass_mark: 70, excellent_from: 90, critical_fail_cap: 50, effective_from: '2026-01-01', created_by: null, created_by_name: null, created_at: '', updated_at: '' },
] as never

describe('SettingsManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(countReviewsAffectedBySettings as jest.Mock).mockResolvedValue({ count: 3 })
    ;(saveSettingsAction as jest.Mock).mockResolvedValue({ rescored: 3 })
  })

  it('shows current values and history', () => {
    render(<SettingsManager history={history} today="2026-12-01" />)
    expect(screen.getByText(/current settings/i)).toBeInTheDocument()
    expect(screen.getByTestId('current-pass-mark')).toHaveTextContent('75')
    expect(screen.getByTestId('current-excellent-from')).toHaveTextContent('92')
    expect(screen.getByTestId('current-critical-cap')).toHaveTextContent('40')
    expect(screen.getByText('2026-01-01')).toBeInTheDocument()
    expect(screen.getByText('Rita')).toBeInTheDocument()
  })

  it('warns "N reviews will be re-scored" before save', async () => {
    render(<SettingsManager history={history} today="2026-12-01" />)
    await userEvent.click(screen.getByRole('button', { name: /^save settings$/i }))
    expect(await screen.findByText(/3 reviews will be re-scored/i)).toBeInTheDocument()
    expect(countReviewsAffectedBySettings).toHaveBeenCalledWith('2026-12-01')
    expect(saveSettingsAction).not.toHaveBeenCalled()
  })

  it('rejects a blank cap without calling either action', async () => {
    render(<SettingsManager history={history} today="2026-12-01" />)
    await userEvent.clear(screen.getByLabelText('Critical-fail cap'))
    await userEvent.click(screen.getByRole('button', { name: /^save settings$/i }))
    expect(await screen.findByText(/critical-fail cap must be a number/i)).toBeInTheDocument()
    expect(countReviewsAffectedBySettings).not.toHaveBeenCalled()
    expect(saveSettingsAction).not.toHaveBeenCalled()
  })

  it('shows the values and effective date in the confirmation', async () => {
    render(<SettingsManager history={history} today="2026-12-01" />)
    await userEvent.click(screen.getByRole('button', { name: /^save settings$/i }))
    const box = (await screen.findByText(/3 reviews will be re-scored/i)).closest('div')!
    expect(box).toHaveTextContent('Pass mark 75')
    expect(box).toHaveTextContent('Excellent from 92')
    expect(box).toHaveTextContent('Critical-fail cap 40')
    expect(box).toHaveTextContent('effective 2026-12-01')
  })

  it('calls saveSettingsAction with numbers', async () => {
    render(<SettingsManager history={history} today="2026-12-01" />)
    await userEvent.click(screen.getByRole('button', { name: /^save settings$/i }))
    await userEvent.click(await screen.findByRole('button', { name: /confirm and save/i }))
    await waitFor(() => expect(saveSettingsAction).toHaveBeenCalledWith({ passMark: 75, excellentFrom: 92, criticalFailCap: 40, effectiveFrom: '2026-12-01' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('shows a returned error', async () => {
    ;(saveSettingsAction as jest.Mock).mockResolvedValue({ error: 'Pass mark must be below Excellent-from.' })
    render(<SettingsManager history={history} today="2026-12-01" />)
    await userEvent.click(screen.getByRole('button', { name: /^save settings$/i }))
    await userEvent.click(await screen.findByRole('button', { name: /confirm and save/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Pass mark must be below Excellent-from.')
  })
})
