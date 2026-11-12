// T2 Queue Hub merge — ported from
// t2-queue-hub/backend/src/utils/rootCauses.js. Static taxonomy lives in
// ./constants (client-safe — see that file's header comment for why);
// mergedOptions()/getRootCauses()/getIssueTypes()/addCustomOption() below
// query through the shared `sql` pool (async) instead of better-sqlite3,
// so this module stays server-only.

import { sql } from '@/lib/db/pool'
import { PROJECTS, ROOT_CAUSES, SOLUTION_OUTCOMES, T3_ESCALATION_TEAMS, PRIORITIES } from './constants'

export { PROJECTS, ROOT_CAUSES, SOLUTION_OUTCOMES, T3_ESCALATION_TEAMS, PRIORITIES }

export const OUTCOMES = [
  'Solved',
  'Escalated to billing',
  'Escalated to Collections',
  'Escalated to Retentions',
  'Escalated to NPO',
  'Escalated to Logistics',
  'Failed contact',
  'Call back requested (only by the customer)',
  'Escalated to Voice',
  'Issue already resolved',
  'Escalated to Core',
  'Escalated to TL',
  'Sent to a store',
]

const OUTCOME_TEAM_MAP: Record<string, string> = {
  'Escalated to billing': 'Billing',
  'Escalated to Collections': 'Collections',
  'Escalated to Retentions': 'Retentions',
  'Escalated to NPO': 'NPO',
  'Escalated to Logistics': 'Logistics',
  'Escalated to Voice': 'Voice',
  'Escalated to Core': 'Core',
}

export function outcomeToEscalationTeam(outcome: string): string | null {
  return OUTCOME_TEAM_MAP[outcome] || null
}

async function mergedOptions(category: 'root_cause' | 'issue_type', staticList: string[]): Promise<string[]> {
  const rows = await sql<{ value: string }[]>`
    SELECT value FROM custom_options WHERE category = ${category} ORDER BY value ASC
  `
  const custom = rows.map((r) => r.value).filter((v) => !staticList.includes(v))
  return [...staticList, ...custom]
}

export async function getRootCauses(): Promise<string[]> {
  return mergedOptions('root_cause', ROOT_CAUSES)
}

export async function getIssueTypes(staticIssueTypes: string[]): Promise<string[]> {
  return mergedOptions('issue_type', staticIssueTypes)
}

export async function addCustomOption({ category, value, createdBy }: { category: 'root_cause' | 'issue_type'; value: string; createdBy: string | null }) {
  await sql`
    INSERT INTO custom_options (category, value, created_by) VALUES (${category}, ${value}, ${createdBy})
    ON CONFLICT (category, value) DO NOTHING
  `
}
