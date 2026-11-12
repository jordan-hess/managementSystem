import { ReportFilters } from './filters'
import { isSocialChannel } from './fragments'

export interface FilterVisibility {
  showIssueType: boolean
  showRootCause: boolean
  showSimType: boolean
  showSwapReason: boolean
  showPortIssueType: boolean
}

const NONE: FilterVisibility = { showIssueType: false, showRootCause: false, showSimType: false, showSwapReason: false, showPortIssueType: false }

/**
 * Which queue-specific filter selects FilterBar shows, driven by the
 * global Team/Queue selection. Social's issue-type/root-cause is one flat
 * pair of columns (not queue-varying like T2's), so it shows either for a
 * specific Social channel or for Team=Social with no channel chosen
 * (aggregating across all 5 channels) — unlike T2, which needs a specific
 * queue selected first since its queue-specific fields differ per queue
 * (SIM SWAP swaps Issue Type/Root Cause out for SIM Type/Reason for Swap;
 * Porting only has Port Issue Type).
 */
export function resolveFilterVisibility(team: ReportFilters['team'], queue: string | undefined): FilterVisibility {
  if (isSocialChannel(queue) || (team === 'social' && !queue)) return { ...NONE, showIssueType: true, showRootCause: true }
  if (team === 'social' || !queue) return NONE

  if (queue === 'ADVANCED' || queue === 'VOICE') return { ...NONE, showIssueType: true, showRootCause: true }
  if (queue === 'SIM SWAP') return { ...NONE, showSimType: true, showSwapReason: true }
  if (queue === 'PORTING') return { ...NONE, showPortIssueType: true }

  return NONE
}
