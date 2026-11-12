import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HistoryList from './HistoryList'
import type { BoardAgent } from '@/lib/queues/board'
import type { QueueHistoryRow } from '@/lib/queues/actions'

jest.mock('@/lib/queues/actions', () => ({ getQueueHistoryAction: jest.fn() }))
import { getQueueHistoryAction } from '@/lib/queues/actions'

const history = getQueueHistoryAction as jest.Mock

const agents: BoardAgent[] = [
  { id: 'u1', full_name: 'Ann Lee', department: 'T2' },
  { id: 'u2', full_name: 'Bob Ray', department: 'Social' },
]

function row(over: Partial<QueueHistoryRow> = {}): QueueHistoryRow {
  return {
    date: '2030-11-03',
    kind: 'main',
    previous_queue: 'VOICE',
    new_queue: 'PORTING',
    reason: null,
    effective_at: '2030-11-03 09:05:00',
    agent_name: 'Ann Lee',
    changed_by_name: 'Tom Lead',
    ...over,
  }
}

beforeEach(() => history.mockReset())

describe('HistoryList', () => {
  it('renders each history row as a log line', async () => {
    history.mockResolvedValue({
      data: [
        row({ reason: 'Skills match' }),
        row({ previous_queue: null, new_queue: 'VOICE', agent_name: 'Bob Ray' }),
        row({ new_queue: null, agent_name: null, changed_by_name: 'Sam Boss' }),
      ],
    })
    render(<HistoryList agents={agents} />)

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('09:05 · Sun 3 Nov · Ann Lee: VOICE → PORTING · Skills match · by Tom Lead')
    expect(items[1]).toHaveTextContent('Bob Ray: bench → VOICE')
    expect(items[2]).toHaveTextContent('Deleted user: VOICE → bench')
    expect(items[2]).toHaveTextContent('by Sam Boss')
  })

  it('labels additional-platform rows', async () => {
    history.mockResolvedValue({
      data: [
        row({ kind: 'additional', previous_queue: null, new_queue: 'Dark posts' }),
        row({ kind: 'additional', previous_queue: 'Dark posts', new_queue: null }),
        row({ kind: 'additional', previous_queue: 'Dark posts', new_queue: 'TikTok' }),
      ],
    })
    render(<HistoryList agents={agents} />)

    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Ann Lee: + Dark posts (additional)')
    expect(items[1]).toHaveTextContent('Ann Lee: − Dark posts (additional)')
    expect(items[2]).toHaveTextContent('Ann Lee: Dark posts → TikTok (additional)')
  })

  it('changing the range refetches with the new from/to', async () => {
    history.mockResolvedValue({ data: [] })
    render(<HistoryList agents={agents} />)
    await screen.findByText(/No queue changes/)
    const weekCall = history.mock.calls[0][0]
    expect(weekCall.from < weekCall.to).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Day' }))
    await waitFor(() => expect(history).toHaveBeenCalledTimes(2))
    const dayCall = history.mock.calls[1][0]
    expect(dayCall.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(dayCall.to).toBe(dayCall.from)
  })

  it('filters by agent, grouped by department', async () => {
    history.mockResolvedValue({ data: [] })
    render(<HistoryList agents={agents} />)
    await screen.findByText(/No queue changes/)
    const select = screen.getByLabelText('Filter by agent')
    expect(screen.getByRole('group', { name: 'T2' })).toContainElement(screen.getByRole('option', { name: 'Ann Lee' }))
    await userEvent.selectOptions(select, 'u2')
    await waitFor(() => expect(history).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'u2' })))
  })

  it('pages 20 rows at a time', async () => {
    history.mockResolvedValue({ data: Array.from({ length: 25 }, (_, i) => row({ agent_name: `Agent ${i}` })) })
    render(<HistoryList agents={agents} />)
    expect(await screen.findAllByRole('listitem')).toHaveLength(20)
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('shows the error when loading fails', async () => {
    history.mockResolvedValue({ error: 'Could not load queue history.' })
    render(<HistoryList agents={agents} />)
    expect(await screen.findByText('Could not load queue history.')).toBeInTheDocument()
  })

  it('shows an error instead of loading forever when the request itself fails', async () => {
    history.mockRejectedValue(new Error('network down'))
    render(<HistoryList agents={agents} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load queue history.')
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })
})
