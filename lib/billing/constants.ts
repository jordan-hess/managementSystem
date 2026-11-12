// Billing queue — pure constants only, no DB import. Mirrors the existing
// split between lib/t2/constants.ts and lib/queues/constants.ts: client-safe
// constants that can be imported by 'use client' components without pulling in
// the postgres package or lib/db/pool.

import { isBillingDepartment } from '@/lib/departments'

export const BILLING_CHANNELS = ['Stitch', 'Peach Payments', 'Pay@', 'Receivables'] as const
export const BILLING_REASONS = ['Refund', 'Wallet Adjustment', 'Billing Dispute', 'Payment Allocation', 'Provisioning', 'Account Statement'] as const
export const BILLING_AMOUNT_REASONS: readonly string[] = ['Refund', 'Wallet Adjustment']

// Not the same thing as BILLING_CHANNELS above — those are where a ticket
// escalates TO (Stitch/Peach Payments/Pay@/Receivables, the "Channel" field
// on a Billing ticket). This is what a Billing agent is currently working
// FROM — the two options for the self-service "my current queue" widget
// (MyQueueWidget.tsx / setMyQueueAction), same self-tracking concept T2/
// Social agents use their own queues for.
export const BILLING_AGENT_QUEUES = ['Teams', 'Station'] as const

export function isBillingAgent(profile: { department?: string | null } | null | undefined): boolean {
  return isBillingDepartment(profile?.department)
}
