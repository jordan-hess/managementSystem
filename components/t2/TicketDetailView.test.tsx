import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TicketDetailView from './TicketDetailView'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/t2/actions', () => ({
  addTicketNoteAction: jest.fn(), updateDiagnosticsAction: jest.fn(), solveTicketAction: jest.fn(),
  escalateTicketAction: jest.fn(), acknowledgeEscalationAction: jest.fn(), respondEscalationAction: jest.fn(),
  validateEscalationAction: jest.fn(), reassignCallbackTicketAction: jest.fn(), closeTicketAction: jest.fn(),
  reviewSolutionAction: jest.fn(),
}))
import { solveTicketAction, escalateTicketAction, reassignCallbackTicketAction, respondEscalationAction } from '@/app/(app)/t2/actions'

const el = (id: string) => document.getElementById(id) as HTMLElement
const ticket = (over = {}) => ({
  id: 't1', status: 'open', queue: 'ADVANCED', created_at: '2030-01-01 10:00:00', customer_name: 'Ann', customer_phone: '082',
  customer_email_onfile: null, regular_site: null, serving_site: null, escalation_destination: null, ...over,
}) as never

function setup(over: { role?: string; ticket?: object; escalations?: unknown[]; t2Team?: string | null } = {}) {
  render(
    <TicketDetailView
      ticket={ticket(over.ticket)} events={[]} escalations={(over.escalations ?? []) as never} solutions={[]}
      role={over.role ?? 'agent'} t2Team={over.t2Team ?? null} userId="u1" activeAssistance={[]}
      activeAgents={[{ id: 'a1', full_name: 'Agent One' }]}
    />,
  )
}

describe('TicketDetailView field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows red errors under each empty resolve field together', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /mark resolved/i }))
    for (const [id, msg] of [
      ['ticket-solve_troubleshooting', 'Troubleshooting performed is required.'],
      ['ticket-solve_findings', 'Findings are required.'],
      ['ticket-solve_solution', 'Solution is required.'],
    ]) {
      expect(el(id)).toHaveAttribute('aria-invalid', 'true')
      expect(el(id).className).toContain('border-red-500')
      expect(screen.getByText(msg)).toBeInTheDocument()
    }
    expect(solveTicketAction).not.toHaveBeenCalled()
  })

  it('clears only the edited resolve field\'s error', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /mark resolved/i }))
    await userEvent.type(el('ticket-solve_findings'), 'Found it')
    expect(screen.queryByText('Findings are required.')).not.toBeInTheDocument()
    expect(screen.getByText('Solution is required.')).toBeInTheDocument()
  })

  it('shows escalate-to and reason errors on the escalation form', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /^escalate ticket$/i }))
    await userEvent.click(screen.getByRole('button', { name: /submit escalation/i }))
    expect(el('ticket-escalate_to')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Escalate To is required.')).toBeInTheDocument()
    expect(screen.getByText('Escalation Reason is required.')).toBeInTheDocument()
    expect(escalateTicketAction).not.toHaveBeenCalled()
  })

  it('shows the reassign error under the picker for a callback ticket', async () => {
    setup({ role: 'team_leader', ticket: { status: 'callback' } })
    await userEvent.click(screen.getByRole('button', { name: /^reassign$/i }))
    expect(el('ticket-reassign_to')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Pick who to reassign this ticket to.')).toBeInTheDocument()
    expect(reassignCallbackTicketAction).not.toHaveBeenCalled()
  })

  it('shows the T3 respond error under the response box', async () => {
    setup({
      role: 't3', t2Team: 'NPO', ticket: { status: 'escalated' },
      escalations: [{ id: 'e1', escalate_to: 'NPO', status: 'acknowledged', priority: 'high', escalation_reason: 'why', created_at: '2030-01-01 10:00:00' }],
    })
    await userEvent.click(screen.getByRole('button', { name: /submit response/i }))
    expect(el('ticket-respond_text-e1')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter your response before submitting.')).toBeInTheDocument()
    expect(respondEscalationAction).not.toHaveBeenCalled()
  })

  it('shows a server error in the top banner', async () => {
    ;(solveTicketAction as jest.Mock).mockResolvedValue({ error: 'Could not resolve ticket.' })
    setup()
    await userEvent.type(el('ticket-solve_troubleshooting'), 'a')
    await userEvent.type(el('ticket-solve_findings'), 'b')
    await userEvent.type(el('ticket-solve_solution'), 'c')
    await userEvent.click(screen.getByRole('button', { name: /mark resolved/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not resolve ticket.')
    expect(alert).not.toHaveAttribute('id')
  })
})
