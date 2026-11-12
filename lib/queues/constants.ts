// Phase 2 (unified Tickets page) — the full 9-value "current queue"
// vocabulary spanning both T2's queues and the Social channels, used by the
// self-service "my current queue" picker and by team-lead queue assignment.
// Each value keeps its existing native casing (T2 uppercase-with-spaces,
// Social lowercase-single-token) rather than being normalized — see
// Database/migrations/agent-queue-assignments-unify.sql's comment for why.

import { QUEUES } from '@/lib/t2/constants'
import { BILLING_AGENT_QUEUES } from '@/lib/billing/constants'

/**
 * Added 2026-09-23. ASSIGNMENT-ONLY: an agent can be rostered onto one of
 * these (Database/migrations/extended-queues-assignment-2026-09-23.sql
 * widens agent_queue_assignments_queue_check to accept them), but
 * support_tickets_channel_check is deliberately NOT widened, so no ticket
 * can be raised in one yet. Selecting one in the /tickets queue filter
 * therefore returns nothing — that is expected, not a bug, until the
 * channel constraint is widened too.
 *
 * Kept out of SOCIAL_QUEUES on purpose: that list drives the reporting
 * Social channel summary, which reads support_tickets.channel. Adding
 * values no support ticket can hold would only add permanently-empty rows
 * to the report.
 *
 * Values keep the casing the business uses them in (per this file's
 * header rule), so they need no display-label mapping.
 */
export const EXTENDED_QUEUES = ['ICASA', 'ODU', 'TikTok', 'LinkedIn', 'TrustPilot', 'Reddit', 'Sprinklr', 'Dark posts'] as const

/**
 * Added 2026-11-01. TrustPilot and LinkedIn are covered by the same agents,
 * so the picker offers them as one value. The separate 'TrustPilot' and
 * 'LinkedIn' stay in EXTENDED_QUEUES (and the CHECK constraints) so existing
 * assignments remain valid; they are just no longer offered.
 */
export const TRUSTPILOT_LINKEDIN = 'TrustPilot & LinkedIn' as const

/** Most additional platforms an agent can cover on a day, on top of the main queue. */
export const MAX_ADDITIONAL_QUEUES = 2

/** EXTENDED_QUEUES as the picker offers them: TrustPilot + LinkedIn merged at LinkedIn's position. */
export const PICKER_EXTENDED_QUEUES: string[] = EXTENDED_QUEUES.flatMap((q) =>
  q === 'LinkedIn' ? [TRUSTPILOT_LINKEDIN] : q === 'TrustPilot' ? [] : [q],
)

export const ALL_QUEUES = [...QUEUES, 'freescout', 'whatsapp', 'hellopeter', 'mybroadband', 'pissedcustomer', 'BILLING', ...EXTENDED_QUEUES, TRUSTPILOT_LINKEDIN] as const
export type AnyQueue = (typeof ALL_QUEUES)[number]

export const SOCIAL_QUEUES = ['freescout', 'whatsapp', 'hellopeter', 'mybroadband', 'pissedcustomer'] as const

// Display labels for SOCIAL_QUEUES values — mirrors the casing already used
// by MyQueueWidget.tsx's own SOCIAL_LABELS and SupportTicketModal.tsx's own
// CHANNEL_CONFIG (each kept local to those files; this is the one other
// callers, e.g. the follow-up/callback queue dropdown, should import rather
// than adding a 4th copy). T2 queue values, Billing channels, and
// EXTENDED_QUEUES are already in the casing the business uses, so need no
// mapping — this function just passes those through unchanged.
export const SOCIAL_QUEUE_LABELS: Record<string, string> = {
  freescout: 'Freescout',
  whatsapp: 'WhatsApp',
  hellopeter: 'HelloPeter',
  mybroadband: 'MyBroadband',
  pissedcustomer: 'PissedCustomer',
}

export function queueOptionLabel(value: string): string {
  return SOCIAL_QUEUE_LABELS[value] ?? value
}

// Queue Assignment panel (team-lead roster tool) and the self-service "my
// current queue" widget (MyQueueWidget.tsx) use this narrower list instead
// of ALL_QUEUES: the single 'BILLING' *ticket* queue value is never
// self-assignable here (Billing tickets are created directly via the
// "BOPs Ticket" button, not pulled from a routed queue) — a Billing agent
// instead says which of Teams/Station they're currently working from
// (BILLING_AGENT_QUEUES). Database/migrations/billing-queue-assignment-
// teams-station.sql widens agent_queue_assignments_queue_check to permit them.
export const ASSIGNABLE_QUEUES: string[] = [...ALL_QUEUES.filter((q) => q !== 'BILLING'), ...BILLING_AGENT_QUEUES]
