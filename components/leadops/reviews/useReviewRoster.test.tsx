import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useReviewRoster } from './useReviewRoster'

jest.mock('@/lib/leadops/reviewActions', () => ({ fetchReviewRosterAction: jest.fn() }))
import { fetchReviewRosterAction } from '@/lib/leadops/reviewActions'
const fetchMock = fetchReviewRosterAction as jest.Mock

function Probe({ period = '2026-10-01', enabled = true }: { period?: string; enabled?: boolean }) {
  const r = useReviewRoster(period, enabled)
  return (
    <div>
      <span data-testid="loading">{String(r.loading)}</span>
      <span data-testid="error">{r.error ?? ''}</span>
      <span data-testid="names">{r.people.map((p) => p.name).join(',')}</span>
      <button type="button" onClick={r.reload}>reload</button>
    </div>
  )
}
const text = (id: string) => screen.getByTestId(id).textContent

beforeEach(() => fetchMock.mockReset())

describe('useReviewRoster', () => {
  it('loads the people for the month', async () => {
    fetchMock.mockResolvedValue({ data: [{ id: 'a', name: 'Taylor', status: null }, { id: 'b', name: 'Thabo', status: 'draft' }] })
    render(<Probe />)
    expect(text('loading')).toBe('true')
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(fetchMock).toHaveBeenCalledWith('2026-10-01')
    expect(text('names')).toBe('Taylor,Thabo')
  })

  it('does not fetch when disabled', async () => {
    render(<Probe enabled={false} />)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows loading — never the previous month\'s list — when the month changes', async () => {
    fetchMock.mockResolvedValue({ data: [{ id: 'a', name: 'Taylor', status: null }] })
    const { rerender } = render(<Probe period="2026-10-01" />)
    await waitFor(() => expect(text('loading')).toBe('false'))
    fetchMock.mockResolvedValue({ data: [{ id: 'z', name: 'Zola', status: null }] })
    rerender(<Probe period="2026-09-01" />)
    expect(text('loading')).toBe('true')
    expect(text('names')).toBe('')
    await waitFor(() => expect(text('names')).toBe('Zola'))
  })

  it('a refused or thrown load is an error state with an empty list', async () => {
    fetchMock.mockResolvedValue({ error: 'Could not load this review.' })
    const first = render(<Probe />)
    await waitFor(() => expect(text('error')).toBe('Could not load this review.'))
    expect(text('names')).toBe('')
    first.unmount()
    fetchMock.mockRejectedValue(new Error('x'))
    render(<Probe />)
    await waitFor(() => expect(text('error')).toBe('Could not load this review.'))
  })
  it('reload() after an error shows loading, refetches the same month and then shows the people', async () => {
    fetchMock.mockResolvedValueOnce({ error: 'Could not load this review.' })
    render(<Probe />)
    await waitFor(() => expect(text('error')).toBe('Could not load this review.'))
    fetchMock.mockResolvedValue({ data: [{ id: 'a', name: 'Taylor', status: null }] })
    fireEvent.click(screen.getByRole('button', { name: 'reload' }))
    expect(text('loading')).toBe('true')
    expect(text('error')).toBe('')
    await waitFor(() => expect(text('names')).toBe('Taylor'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('2026-10-01')
  })
})
