// T2 Queue Hub merge — ported near-verbatim from
// t2-queue-hub/backend/src/utils/sla.js. Pure functions, no DB access;
// operates on the TEXT 'YYYY-MM-DD HH:MM:SS' timestamp format tickets.* etc.
// store (see t2-tickets-schema.sql's header comment for why that format was
// kept rather than converting to native timestamptz).

export const RESPONSE_SLA_MINUTES = Number(process.env.RESPONSE_SLA_MINUTES || 240) // 4h
export const RESOLUTION_SLA_MINUTES = Number(process.env.RESOLUTION_SLA_MINUTES || 1440) // 24h

export function minutesBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null
  const start = new Date(startIso.replace(' ', 'T') + 'Z')
  const end = new Date(endIso.replace(' ', 'T') + 'Z')
  return (end.getTime() - start.getTime()) / 60000
}

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

export interface SlaWindow {
  target_minutes: number
  elapsed_minutes: number
  remaining_minutes: number
  breached: boolean
  met: boolean
}

export interface SlaResult {
  response: SlaWindow
  resolution: SlaWindow
}

export interface SlaTicketFields {
  created_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  closed_at: string | null
}

/** Computes derived SLA fields for a ticket row (does not mutate the DB). */
export function computeSla(ticket: SlaTicketFields): SlaResult {
  const createdAt = ticket.created_at
  const now = nowIso()

  const responseEnd = ticket.acknowledged_at || now
  const responseElapsed = minutesBetween(createdAt, responseEnd)!
  const responseBreached = responseElapsed > RESPONSE_SLA_MINUTES

  const resolutionEnd = ticket.resolved_at || ticket.closed_at || now
  const resolutionElapsed = minutesBetween(createdAt, resolutionEnd)!
  const resolutionBreached = resolutionElapsed > RESOLUTION_SLA_MINUTES

  return {
    response: {
      target_minutes: RESPONSE_SLA_MINUTES,
      elapsed_minutes: Math.round(responseElapsed),
      remaining_minutes: Math.round(RESPONSE_SLA_MINUTES - responseElapsed),
      breached: !!responseBreached,
      met: !!ticket.acknowledged_at && !responseBreached,
    },
    resolution: {
      target_minutes: RESOLUTION_SLA_MINUTES,
      elapsed_minutes: Math.round(resolutionElapsed),
      remaining_minutes: Math.round(RESOLUTION_SLA_MINUTES - resolutionElapsed),
      breached: !!resolutionBreached,
      met: !!(ticket.resolved_at || ticket.closed_at) && !resolutionBreached,
    },
  }
}
