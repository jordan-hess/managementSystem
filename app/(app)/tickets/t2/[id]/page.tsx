import { redirect } from 'next/navigation'

// Every T2 ticket (Billing included) now opens as an in-page modal from the
// unified Tickets page (see openTicket in TicketListTable.tsx and
// T2TicketDetailModal.tsx) instead of this dedicated detail page — matching
// how Social tickets already worked. This route only exists so a direct or
// bookmarked link still resolves correctly, by redirecting into that same
// modal flow. /t2/:id also redirects here first (next.config.ts), then on
// to /tickets.
export default async function T2TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/tickets?source=t2_ticket&id=${id}`)
}
