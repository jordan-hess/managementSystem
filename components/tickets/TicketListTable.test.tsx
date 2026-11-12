import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TicketListTable from './TicketListTable'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/tickets',
  useSearchParams: () => new URLSearchParams(),
}))

const baseRow = {
  sourceType: 'callback' as const,
  sourceId: 'cb-1',
  ticketLabel: 'Callback',
  queueOrChannel: null,
  status: 'pending',
  agentId: 'a1',
  agentName: 'Agent One',
  updatedAt: '2026-10-12T10:00:00.000Z',
  createdAt: '2026-10-12T09:00:00.000Z',
  issueType: null,
  rootCause: null,
}

function renderTable(rows: Parameters<typeof TicketListTable>[0]['rows']) {
  render(
    <TicketListTable
      rows={rows} totalCount={rows.length} page={0} pageSize={25} queue="all" statusGroup="active" nativeStatus=""
      mine={false} privileged={false} agentOptions={[]} assignedAgentId="" updatedFrom="" updatedTo=""
    />,
  )
}

describe('TicketListTable customer name', () => {
  beforeEach(() => push.mockClear())

  it('shows a manual callback (no customerId) name as plain text and lets the click open the ticket', async () => {
    renderTable([{ ...baseRow, customerId: null, customerName: 'Ann Manual' }])
    const name = screen.getByText('Ann Manual')
    expect(name).not.toHaveAttribute('role', 'link')
    expect(name).not.toHaveAttribute('title')
    await userEvent.click(name)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0]).toContain('source=callback')
    expect(push.mock.calls[0][0]).not.toContain('customer=')
  })

  it('keeps a customer row name as a link that opens the customer history, not the ticket', async () => {
    renderTable([{ ...baseRow, customerId: 'c1', customerName: 'Ann' }])
    const link = screen.getByRole('link', { name: 'Ann' })
    await userEvent.click(link)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0]).toContain('customer=c1')
    expect(push.mock.calls[0][0]).not.toContain('source=')
  })
})
