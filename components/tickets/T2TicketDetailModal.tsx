'use client'

import Modal from '@/components/ui/Modal'
import TicketDetailView from '@/components/t2/TicketDetailView'
import { Ticket, TicketEscalation, TicketEvent, TicketSolution } from '@/lib/t2/types'
import { ActiveAssistanceRecord } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  data: {
    ticket: Ticket & { customer_name: string | null; customer_phone: string | null; customer_email_onfile: string | null }
    events: TicketEvent[]
    escalations: TicketEscalation[]
    solutions: TicketSolution[]
    activeAssistance: ActiveAssistanceRecord[]
    activeAgents: { id: string; full_name: string }[]
    role: string
    t2Team: string | null
  }
  userId: string
  /** Re-fetches this ticket's own detail data — see TicketDetailView.tsx's onRefresh prop for why the modal needs this beyond router.refresh(). */
  onRefresh: () => void
}

/**
 * Every T2-queue ticket now opens as an in-page modal from the unified
 * Tickets page, matching Social's flow — TicketDetailView itself is
 * unchanged (still the full diagnostics/outcome/escalation workflow), just
 * wrapped here instead of rendered by its own /tickets/t2/[id] page route.
 */
export default function T2TicketDetailModal({ open, onClose, data, userId, onRefresh }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={`Ticket ${data.ticket.ticket_number}`} size="4xl">
      <TicketDetailView
        ticket={data.ticket}
        events={data.events}
        escalations={data.escalations}
        solutions={data.solutions}
        role={data.role}
        t2Team={data.t2Team}
        userId={userId}
        activeAssistance={data.activeAssistance}
        activeAgents={data.activeAgents}
        onRefresh={onRefresh}
      />
    </Modal>
  )
}
