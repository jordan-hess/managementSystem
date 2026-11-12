// T2 Queue Hub merge — pure constants only, no DB import. Split out of
// lib/t2/queues.ts and lib/t2/rootCauses.ts because those modules also
// import lib/db/pool (the `postgres` package, which needs Node's
// `net`/`tls` and can't bundle for the browser) — a 'use client' component
// importing even a plain constant from either module pulled in the whole
// DB client and broke the build. Client components should import from here.

export const QUEUES = ['ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING'] as const
export type Queue = (typeof QUEUES)[number]

export const TEAM_TO_QUEUE: Record<string, Queue> = {
  'CEC.ADVANCED.A': 'ADVANCED',
  'SIM Swap': 'SIM SWAP',
  Voice: 'VOICE',
  'Porting/MNP': 'PORTING',
}

export const PROJECTS = ['B2B', 'Tickets (SF)']

export const ROOT_CAUSES = [
  'Site down',
  'No coverage',
  'IMSI miss match',
  'Wall garden (only on HoB)',
  'Poor signal',
  'High latency / Packet loss',
  'Service affecting alarm',
  'Activation/provisioning',
  'Unlizones activation',
  'Primary/Secondary SIM missing',
  'Loop hot spot',
  'Unlizone not working',
  'Faulty device',
  'Secondary SIM not working',
  'Out of Loop zone',
  'In a 4G only coverage',
  'Smart switching',
  'Suspended Account',
  'Potential High PRB',
  'No policy defined',
  'Suspended Unlizone',
  'Network Config',
  'PLMN 73 or 38 removed',
]

// Outcomes captured on ticket_solutions.outcome are a smaller, fixed set
// (drives the ticket lifecycle) distinct from the richer OUTCOMES list below
// (drives reporting on *why* a ticket left the T2 desk).
export const SOLUTION_OUTCOMES = ['resolved', 'customer_to_monitor', 'escalated', 'unresolved'] as const

export const T3_ESCALATION_TEAMS = [
  'NPO', 'IP Core', 'PS Core', 'ISOC', 'RAN Configs',
  'Billing', 'Retentions', 'Collections', 'Logistics', 'Voice', 'Core', 'Other T3 Team',
]

export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

// Ticket-creation-time "Outcome" for the Advanced queue (informational —
// see actions.ts's createTicketAction header comment) and the escalation
// teams it can pick from. Distinct from T3_ESCALATION_TEAMS above (that
// list is for the real post-creation Escalate action on the ticket detail
// page) — "Team Leader" here is a hand-off note, not a T3 escalation.
export const ADVANCED_OUTCOMES = [
  'Solved',
  'Escalated',
  'Send to store',
  'Issue already resolved',
  'Failed Contact',
]
export const ADVANCED_ESCALATE_TEAMS = ['Billing', 'Collections', 'Retentions', 'NPO', 'Logistics', 'Team Leader', 'CORE', 'ISOC']

export const ESCALATION_PATHS = [
  'LoopDL',
  'AskBot',
  'Internal escalation (Retentions, billing, collections etc)',
  'Backlog/OT',
  'Special Project',
]

export const DEVICES = [
  '101/101 Pro',
  'Loopphone',
  'Loop',
  'ODU',
  'Legacy Routers (ZTE, Oppo, etc)',
  'Legacy 4G (Mobile/Data)',
]
