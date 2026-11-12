'use server'

/**
 * leadOps Time & Motion — resolves a team leader's REAL shift for a REAL
 * date from opsHub's actual roster tables, replacing the old manual
 * "Shift template" dropdown ("the system should read the team leader's
 * roster and determine if they are 08:00–17:00 or 11:00–20:00").
 *
 * THE ONE DELIBERATE EXCEPTION IN THIS DIRECTORY: every other file under
 * lib/leadops/ is pure and imports nothing from lib/db/pool or lib/roster,
 * so it can be safely imported by 'use client' components (see
 * lib/leadops/types.ts's header comment). This file is the sanctioned
 * boundary-crossing point instead — a Server Action, the same mechanism
 * every other opsHub client component already uses to reach the database
 * (e.g. lib/queues/actions.ts), called from LeadOpsDataProvider.tsx rather
 * than imported directly by any presentational component.
 *
 * Query shape mirrors lib/roster/scheduleAlerts.ts's getAgentsOffOnDate —
 * the closest existing analogue (same resolveShift() call, same
 * ResolvedDaySlot, a different question asked of it). team_rotations is
 * passed as [] deliberately: the mock team leaders now map to SIT's 5 real
 * ones, and all 5 resolve via the newer pattern-based path (4 via a
 * personal rotation_pattern_id, Avery via Billing's team-level pattern)
 * before resolveShift ever reaches the manual team_rotations branch — see
 * this session's earlier fix-tl-rotation-to-28-day-cycle migration.
 */

import type { ResolvedTlShift } from './rosterShiftMapping'
import { resolveRosterShift } from './rosterShiftResolve'
import { isManagementTier, isTeamLeader } from './permissions'
import { requireLeadOps } from './serverGuard'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A team leader may resolve their own shift; management/HOD any team leader's.
 * Everyone else — and everyone when leadOps is off — is refused: this reads
 * another person's roster and attendance, so it needs the same server-side gate
 * as the scorecard actions, not just the hidden nav entry.
 */
export async function resolveTeamLeaderShiftAction(tlId: string, date: string): Promise<ActionResult<ResolvedTlShift>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  const allowed = isManagementTier(viewer) || (isTeamLeader(viewer) && tlId === userId)
  if (!allowed) return { error: 'Forbidden' }

  if (!tlId || !date) return { error: 'tlId and date are required' }
  if (!DATE_RE.test(date)) return { error: 'Invalid date.' }

  return resolveRosterShift(tlId, date)
}
