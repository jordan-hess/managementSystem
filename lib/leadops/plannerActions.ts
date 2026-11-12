'use server'

/**
 * leadOps Time & Motion — real data. Separate from realDataActions.ts and activityActions.ts on purpose:
 * a problem with these tables must never take down KPI Actuals, the Manager Scorecard or Daily/Weekly.
 * See docs/superpowers/specs/2026-10-09-leadops-time-motion-design.md.
 *
 * Every action starts with requireLeadOps() (session + active account) and authorises on its own: a
 * Server Action is a public POST endpoint, so hiding a control in the UI is never the authorisation.
 * Nothing the client sends is trusted for identity or for which shift applies.
 */

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { blocksForTemplate } from './constants'
import { isManagementTier, isTeamLeader } from './permissions'
import { isValidIsoDate, plannerDayWindow } from './periods'
import { normalizePlannerDay, PLANNER_MESSAGES as M, validatePlannerDay } from './plannerLimits'
import type { PlannerBlockInput, PlannerUnplannedInput } from './plannerLimits'
import { resolveRosterShift } from './rosterShiftResolve'
import { templateIdForResolvedShift } from './rosterShiftMapping'
import { requireLeadOps } from './serverGuard'
import type { PlannerBlockLog, PlannerCategory, PlannerUnplannedEntry } from './types'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

export interface LeadOpsPlannerDay {
  /** 0 = never saved. Send it back as `expectedRevision` when saving. */
  revision: number
  logs: PlannerBlockLog[]
  unplanned: PlannerUnplannedEntry[]
  /** True when a saved block does not belong to the shift the roster resolves today: the day is read-only. */
  rosterMismatch: boolean
}

// ─── Row shapes (date columns already come back as 'YYYY-MM-DD' strings, see lib/db/pool.ts) ──

interface LogRow {
  id: string
  tl_id: string
  date: string
  template_block_id: string
  status: 'completed' | 'moved' | 'not_completed'
  actual_minutes: number | null
  actual_category: PlannerCategory | null
  actual_activity: string | null
  reason: string | null
  updated_at: string
}

const toLog = (r: LogRow): PlannerBlockLog => ({
  id: r.id,
  tl_id: r.tl_id,
  date: r.date,
  template_block_id: r.template_block_id,
  status: r.status,
  actual_minutes: r.actual_minutes === null ? null : Number(r.actual_minutes),
  actual_category: r.actual_category,
  actual_activity: r.actual_activity,
  reason: r.reason,
  updated_at: r.updated_at,
})

interface UnplannedRow {
  id: string
  tl_id: string
  date: string
  category: PlannerCategory
  minutes: number
  reason: string
  displaced_block_id: string | null
  created_at: string
}

const toUnplanned = (r: UnplannedRow): PlannerUnplannedEntry => ({
  id: r.id,
  tl_id: r.tl_id,
  date: r.date,
  category: r.category,
  minutes: Number(r.minutes),
  reason: r.reason,
  displaced_block_id: r.displaced_block_id,
  created_at: r.created_at,
})

/** The block ids of the shift the roster currently resolves for this team leader and date, or an error. */
async function currentBlockIds(tlId: string, date: string): Promise<{ ids: string[]; hasShift: boolean } | { error: string }> {
  const shift = await resolveRosterShift(tlId, date)
  if (shift.error !== undefined) return { error: shift.error }
  const templateId = templateIdForResolvedShift(shift.data)
  return { ids: templateId ? blocksForTemplate(templateId).map((b) => b.id) : [], hasShift: templateId !== null }
}

/** The template block ids a saved day refers to: its block logs and any block an unplanned entry displaced. */
function savedBlockIds(
  logs: { template_block_id: string }[],
  unplanned: { displaced_block_id: string | null }[],
): string[] {
  return [
    ...logs.map((r) => r.template_block_id),
    ...unplanned.map((u) => u.displaced_block_id).filter((id): id is string => typeof id === 'string' && id !== ''),
  ]
}

// ─── Fetch ────────────────────────────────────────────────────────────────

/**
 * One team leader's planner day. A team leader reads only their own; management/HOD read any REAL team
 * leader's (the target must have a team_leaders row). Everyone else is refused.
 */
export async function fetchLeadOpsPlannerAction(tlId: string, date: string): Promise<ActionResult<LeadOpsPlannerDay>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  if (!isManagementTier(viewer) && !(isTeamLeader(viewer) && tlId === userId)) return { error: 'Forbidden' }
  if (typeof date !== 'string' || !isValidIsoDate(date)) return { error: 'Invalid date.' }
  if (typeof tlId !== 'string' || tlId === '') return { error: M.invalidTeamLeader }

  try {
    const leader = await sql`SELECT 1 FROM team_leaders WHERE profile_id = ${tlId}`
    if (leader.length === 0) return { error: M.invalidTeamLeader }

    const [days, logRows, unplannedRows] = await Promise.all([
      sql<{ revision: number }[]>`SELECT revision FROM planner_days WHERE tl_id = ${tlId} AND date = ${date}`,
      sql<LogRow[]>`SELECT * FROM planner_block_logs WHERE tl_id = ${tlId} AND date = ${date} ORDER BY template_block_id`,
      sql<UnplannedRow[]>`SELECT * FROM planner_unplanned_entries WHERE tl_id = ${tlId} AND date = ${date} ORDER BY created_at, id`,
    ])

    // Every saved block id counts — the blocks' own ids and the blocks unplanned entries displaced — so a saved
    // row that belongs to another template is never hidden and never silently blocks a save (spec section 5).
    const savedIds = savedBlockIds(logRows, unplannedRows)
    let rosterMismatch = false
    if (savedIds.length > 0) {
      const current = await currentBlockIds(tlId, date)
      if ('error' in current) return { error: M.loadFailed }
      rosterMismatch = savedIds.some((id) => !current.ids.includes(id))
    }

    return {
      data: {
        revision: days.length > 0 ? Number(days[0].revision) : 0,
        logs: logRows.map(toLog),
        unplanned: unplannedRows.map(toUnplanned),
        rosterMismatch,
      },
    }
  } catch (error) {
    // A forged id that is not a uuid makes Postgres throw invalid_text_representation: not an outage.
    if ((error as { code?: string } | null)?.code === '22P02') return { error: M.invalidTeamLeader }
    console.error('fetchLeadOpsPlannerAction failed', error)
    return { error: M.loadFailed }
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────

export interface SavePlannerDayRequest {
  tlId: string
  date: string
  /** The revision the screen last loaded or saved; 0 for a day that has never been saved. */
  expectedRevision: number
  blocks: PlannerBlockInput[]
  unplanned: PlannerUnplannedInput[]
}

/**
 * A team leader's own planner day, saved as one unit. Checks run in this order, all before any write:
 * identity → date → editing window → revision shape → roster → field rules. Then ONE transaction checks
 * the expected revision and bumps it (atomically, in the same statement), and replaces the day's rows;
 * if anything fails the whole transaction — the revision bump included — rolls back.
 */
export async function savePlannerDayAction(req: SavePlannerDayRequest): Promise<ActionResult<{ revision: number }>> {
  const guard = await requireLeadOps()
  if ('error' in guard) return { error: guard.error }
  const { userId, viewer } = guard
  // Only a real team leader (a team_leaders row), and only their own day. Management/HOD read, never write.
  if (!viewer.hasTeamRow || req?.tlId !== userId) return { error: 'Forbidden' }

  const { tlId, date, expectedRevision, blocks, unplanned } = req
  if (typeof date !== 'string' || !isValidIsoDate(date)) return { error: 'Invalid date.' }
  const window = plannerDayWindow(date, new Date())
  if (!window.editable) return { error: window.reason === 'future' ? M.notStarted : M.windowClosed }
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return { error: M.invalidRevision }

  try {
    const current = await currentBlockIds(tlId, date)
    if ('error' in current) return { error: current.error }
    if (!current.hasShift && Array.isArray(blocks) && blocks.length > 0) return { error: M.noShift }

    // Saved rows are never rewritten across a roster change: a day whose saved blocks (including blocks its saved
    // unplanned entries displaced) no longer match is read-only.
    const [savedLogs, savedUnplanned] = await Promise.all([
      sql<{ template_block_id: string }[]>`
        SELECT template_block_id FROM planner_block_logs WHERE tl_id = ${tlId} AND date = ${date}
      `,
      sql<{ displaced_block_id: string | null }[]>`
        SELECT displaced_block_id FROM planner_unplanned_entries WHERE tl_id = ${tlId} AND date = ${date} AND displaced_block_id IS NOT NULL
      `,
    ])
    if (savedBlockIds(savedLogs, savedUnplanned).some((id) => !current.ids.includes(id))) return { error: M.rosterChanged }

    const invalid = validatePlannerDay({ blocks, unplanned }, current.ids)
    if (invalid) return { error: invalid }
    const day = normalizePlannerDay({ blocks, unplanned })

    const outcome = await withTransaction(async (tx) => {
      let revision: number
      if (expectedRevision === 0) {
        // First save: the primary key lets exactly one of two simultaneous first saves insert the day row.
        const rows = await tx<{ revision: number }[]>`
          INSERT INTO planner_days (tl_id, date, revision) VALUES (${tlId}, ${date}, 1)
          ON CONFLICT (tl_id, date) DO NOTHING RETURNING revision
        `
        if (rows.length === 0) return 'conflict' as const
        revision = Number(rows[0].revision)
      } else {
        // Check and bump in one statement; its row lock is held until commit.
        const rows = await tx<{ revision: number }[]>`
          UPDATE planner_days SET revision = revision + 1, updated_at = now()
          WHERE tl_id = ${tlId} AND date = ${date} AND revision = ${expectedRevision} RETURNING revision
        `
        if (rows.length === 0) return 'conflict' as const
        revision = Number(rows[0].revision)
      }

      await tx`DELETE FROM planner_block_logs WHERE tl_id = ${tlId} AND date = ${date}`
      await tx`DELETE FROM planner_unplanned_entries WHERE tl_id = ${tlId} AND date = ${date}`
      for (const b of day.blocks) {
        await tx`
          INSERT INTO planner_block_logs (tl_id, date, template_block_id, status, actual_minutes, actual_category, actual_activity, reason)
          VALUES (${tlId}, ${date}, ${b.template_block_id}, ${b.status}, ${b.actual_minutes}, ${b.actual_category}, ${b.actual_activity}, ${b.reason})
        `
      }
      // clock_timestamp() (not the transaction's now()) keeps the entries in the order they were sent.
      for (const u of day.unplanned) {
        await tx`
          INSERT INTO planner_unplanned_entries (tl_id, date, category, minutes, reason, displaced_block_id, created_at)
          VALUES (${tlId}, ${date}, ${u.category}, ${u.minutes}, ${u.reason}, ${u.displaced_block_id}, clock_timestamp())
        `
      }
      return revision
    })

    if (outcome === 'conflict') return { error: M.conflict }
    return { data: { revision: outcome } }
  } catch (error) {
    console.error('savePlannerDayAction failed', error)
    return { error: M.saveFailed }
  }
}
