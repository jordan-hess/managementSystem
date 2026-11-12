import { sql } from '@/lib/db/pool'
import { ReportFilters } from './filters'
import { isSocialChannel } from './fragments'

export interface FilterOptions {
  issueTypes: string[]
  rootCauses: string[]
  simTypes: string[]
  swapReasons: string[]
  portIssueTypes: string[]
}

const EMPTY: FilterOptions = { issueTypes: [], rootCauses: [], simTypes: [], swapReasons: [], portIssueTypes: [] }

async function distinctValues(column: 'issue_type' | 'root_cause' | 'sim_type' | 'swap_reason' | 'port_issue_type', queue: string): Promise<string[]> {
  const rows = await sql<{ value: string }[]>`
    SELECT DISTINCT t.${sql(column)} AS value
    FROM tickets t
    WHERE t.queue = ${queue} AND t.${sql(column)} IS NOT NULL
    ORDER BY value
  `
  return rows.map((r) => r.value)
}

async function distinctSocialValues(column: 'issue_type' | 'root_cause'): Promise<string[]> {
  const rows = await sql<{ value: string }[]>`
    SELECT DISTINCT st.${sql(column)} AS value
    FROM support_tickets st
    WHERE st.${sql(column)} IS NOT NULL
    ORDER BY value
  `
  return rows.map((r) => r.value)
}

/**
 * Only the values actually present for the selected queue/channel — so a
 * dropdown never offers an option with zero matching tickets. Only queries
 * the column(s) relevant to `queue`; other fields return empty (FilterBar
 * hides them for that queue anyway — see filterVisibility.ts).
 */
export async function getFilterOptions(team: ReportFilters['team'], queue: string | undefined): Promise<FilterOptions> {
  if (isSocialChannel(queue) || (team === 'social' && !queue)) {
    const [issueTypes, rootCauses] = await Promise.all([distinctSocialValues('issue_type'), distinctSocialValues('root_cause')])
    return { ...EMPTY, issueTypes, rootCauses }
  }
  if (team === 'social' || !queue) return EMPTY

  if (queue === 'ADVANCED' || queue === 'VOICE') {
    const [issueTypes, rootCauses] = await Promise.all([distinctValues('issue_type', queue), distinctValues('root_cause', queue)])
    return { ...EMPTY, issueTypes, rootCauses }
  }

  if (queue === 'SIM SWAP') {
    const [simTypes, swapReasons] = await Promise.all([distinctValues('sim_type', queue), distinctValues('swap_reason', queue)])
    return { ...EMPTY, simTypes, swapReasons }
  }

  if (queue === 'PORTING') {
    const portIssueTypes = await distinctValues('port_issue_type', queue)
    return { ...EMPTY, portIssueTypes }
  }

  return EMPTY
}
