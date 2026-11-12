/**
 * leadOps Phase 0 — mock data.
 *
 * Every row here is hand-written and in-memory. NOTHING in this file touches
 * the database, `profiles`, or any other real opsHub table: the whole point
 * of Phase 0 is a reviewable prototype ahead of any schema work. Rows are
 * shaped exactly like the eventual tables (see ./types), so replacing this
 * module with real queries is a substitution rather than a rewrite.
 *
 * Synthetic timestamps use '' rather than a fake date, matching the
 * placeholder convention in lib/roster/resolveShift.ts's AUTO_*_TEMPLATE.
 *
 * Data Entry additions (2026-09-26): a 5th team leader (Avery Bennett —
 * SIT's real Billing team leader, not previously tracked here), a week of
 * daily activity logs per leader, and the Section 13 mock states: completed,
 * moved, not-completed, unplanned, a KPI actual, a KPI marked N/A, an
 * unverified KPI, a verified KPI, and a manager override.
 *
 * RE-KEYED TO REAL PROFILE IDS (2026-09-27): every mock team leader below is
 * now one of SIT's 5 REAL team leaders, by REAL profile id — not an
 * invented person. This became necessary, not optional, once Time & Motion
 * started reading each team leader's REAL roster (rosterShiftAction.ts) to
 * determine their actual 08:00–17:00 vs 11:00–20:00 shift: `profiles.id` is
 * a uuid column, so resolving a roster query against a fictional string
 * like 'tl-1' would fail outright (invalid input syntax for type uuid), not
 * just return empty. The four rotation-pattern leaders (Taylor/Jamie/
 * Casey/Riley) are also literally the same four whose 28-day rotation
 * bug this session fixed earlier — so picking any of them here and any
 * date now resolves a REAL, currently-correct shift. Avery resolves via
 * Billing's team-level pattern (he has no personal rotation_pattern_id;
 * his shift comes from his team_members row + Billing's fixed pattern) —
 * see rosterShiftAction.ts's header comment for the full reasoning.
 *
 * Every OTHER mock row in this file (daily/weekly/planner/score/review) is
 * unaffected in shape — only the tl_id/profile identity changed, via the
 * TL_* constants below, so the Section 13 narrative already written for
 * each "slot" (busiest week, quiet week with a gap, etc.) carries over
 * unchanged onto whichever real person now occupies it.
 *
 * MANAGER SCORECARD ADDITIONS (2026-10-01): MOCK_MANAGER is re-keyed the
 * same way — from the fake 'mgr-1' to Alex Morgan's real SIT profile id
 * — plus MOCK_MANAGER_REVIEWER (Sam Reed-Rivera).
 *
 * REAL DATA (2026-10-01): MOCK_EFFICIENCY_SCORES, MOCK_TL_TEAM_SIZES,
 * MOCK_MANAGER_KPA_RATINGS and MOCK_MANAGER_MONTHLY_REVIEW are GONE from
 * this file — migrated 1:1 into real tables (efficiency_scores,
 * tl_team_sizes, manager_kpa_ratings, manager_monthly_reviews; see
 * Database/migrations/leadops-manager-scorecard-*-2026-10-01.sql) and read
 * via lib/leadops/realDataActions.ts instead. Everything ELSE in this file
 * — team leader/manager identity, daily/weekly activity, the Planner, the TL
 * Efficiency Scorecard — is still Phase 0 mock data. TL Performance Reviews
 * are real now (performance_reviews / review_events, see
 * lib/leadops/reviewActions.ts); see
 * docs/manager-scorecard.md for the scope line.
 */

import { TEMPLATE_EARLY_ID } from './constants'
import type {
  DailyActivityLog,
  ManagerWeeklyLog,
  MockTeamLeader,
  PlannerBlockLog,
  PlannerUnplannedEntry,
  TlShiftDay,
  WeeklyManualLog,
} from './types'
import { plannerDayKey } from './types'

export const MOCK_DATE = '2026-09-22'
export const MOCK_PERIOD = '2026-09-01'

// Real profile ids on SIT (app), confirmed 2026-09-27. Every other mock
// row below references one of these constants rather than a repeated
// literal, so if a profile is ever recreated with a new id, only these five
// lines need to change.
const TL_TAYLOR = '8bebb66a-cd00-466e-9ae8-22a5008735d4' // Taylor Brooks — Social Scarlet's, Social LTE. Personal rotation pattern E.
const TL_JAMIE = '7c9bf228-c4c4-4d04-a809-c5fdb589d56c' // Jamie Carter — T2 Rotation A, B. Personal rotation pattern F.
const TL_CASEY = '4ad8bebf-5cff-45d4-92ae-7a3aef40ecd2' // Casey.Hughes — T2 Rotation C, D. Personal rotation pattern G.
const TL_RILEY = 'f3d76b95-48af-429d-ae55-469a96675d29' // Riley Parker — Social Stars, Social UCT. Personal rotation pattern I.
const TL_AVERY = 'c3194d42-8b45-4e1a-be95-2b311a2a1dbf' // Avery Bennett — Billing. No personal pattern; resolves via Billing's team pattern (fixed Mon–Fri 08:00–17:00).

/** Stand-ins for the `profiles` rows these five real team leaders already have — id/full_name/team mirror the real data, not an invented record. */
export const MOCK_TEAM_LEADERS: MockTeamLeader[] = [
  { id: TL_TAYLOR, full_name: 'Taylor Brooks', team: "Social Scarlet's" },
  { id: TL_JAMIE, full_name: 'Jamie Carter', team: 'T2 Rotation A' },
  { id: TL_CASEY, full_name: 'Casey.Hughes', team: 'T2 Rotation C' },
  { id: TL_RILEY, full_name: 'Riley Parker', team: 'Social Stars' },
  { id: TL_AVERY, full_name: 'Avery Bennett', team: 'Billing' },
]

const MANAGER_ALEX = '93cfcee9-09af-48a9-a1d8-149a09149d66' // Alex Morgan — real SIT profile, role 'management', dept 'Social Manager'.
const REVIEWER_SAM = '857b0793-002f-489c-924f-d91071ef454c' // Sam Reed-Rivera — real SIT profile, role 'management' (a PROD bootstrap script once intended 'hod'; left as-is, see docs/manager-scorecard.md).

export const MOCK_MANAGER = { id: MANAGER_ALEX, full_name: 'Alex Morgan' }
export const MOCK_MANAGER_REVIEWER = { id: REVIEWER_SAM, full_name: 'Sam Reed-Rivera' }

/**
 * Superseded for these five real team leaders by rosterShiftAction.ts's LIVE
 * roster resolution — Time & Motion no longer reads this to decide which
 * template applies (see components/leadops/dataEntry/TimeMotionSection.tsx).
 * Retained as the eventual real `tl_shift_days` row shape and because it may
 * still be referenced elsewhere; not deleted to avoid unrelated churn here.
 */
export const MOCK_SHIFT_DAY: TlShiftDay = {
  tl_id: TL_TAYLOR,
  date: MOCK_DATE,
  shift_template_id: TEMPLATE_EARLY_ID,
}

// ─── Time & Motion — planner days, keyed tl_id|date ──────────────────────
//
// Data Entry is the capture surface for these (see PlannerTab.tsx, which is
// now read-only). Keyed by plannerDayKey() so the store can hold more than
// one team leader's more than one day without the Phase-0 single-TL,
// single-template limitation.

/**
 * One TL's logged day against the 08:00–17:00 template. Deliberately mixes
 * all four statuses so every state is visible on the page:
 *
 *   planned                     540 (9h)
 *   b5 not completed            -30
 *   b4 moved, ran 45 not 60     -15
 *   one 30m unplanned entry     +30
 *   actual                      525 (8h45m)
 *   diagnostic = 45 + 30 =       75 (1h15m)
 *
 * b11 is left `planned` so the "not yet logged" state also shows; it is the
 * end-of-day block, which reads naturally as still open.
 */
export const MOCK_BLOCK_LOGS: PlannerBlockLog[] = [
  mockLog('tpl-early-b1', 'completed'),
  mockLog('tpl-early-b2', 'completed'),
  mockLog('tpl-early-b3', 'completed'),
  {
    ...mockLog('tpl-early-b4', 'moved'),
    actual_minutes: 45,
    actual_category: 'escalations',
    reason: 'A VIP port-out escalation ran over. The coaching slot absorbed it, so the hour was worked as escalations.',
  },
  {
    ...mockLog('tpl-early-b5', 'not_completed'),
    reason: 'The 10:30 escalation was still open — follow-ups rolled into the afternoon queue review instead.',
  },
  mockLog('tpl-early-b6', 'completed'),
  mockLog('tpl-early-b7', 'completed'),
  mockLog('tpl-early-b8', 'completed'),
  mockLog('tpl-early-b9', 'completed'),
  mockLog('tpl-early-b10', 'completed'),
  mockLog('tpl-early-b11', 'planned'),
]

function mockLog(blockId: string, status: PlannerBlockLog['status']): PlannerBlockLog {
  return {
    id: `log-${blockId}`,
    tl_id: TL_TAYLOR,
    date: MOCK_DATE,
    template_block_id: blockId,
    status,
    actual_minutes: null,
    actual_category: null,
    actual_activity: null,
    reason: null,
    updated_at: '',
  }
}

export const MOCK_UNPLANNED: PlannerUnplannedEntry[] = [
  {
    id: 'unp-1',
    tl_id: TL_TAYLOR,
    date: MOCK_DATE,
    category: 'operations',
    minutes: 30,
    reason: 'Unscheduled MNP outage bridge call with the platform team.',
    displaced_block_id: 'tpl-early-b5',
    created_at: '',
  },
]

/**
 * The store's initial planner state, keyed `tl_id|date`. Only tl-1's
 * MOCK_DATE is seeded with the full state above; every other TL/date starts
 * empty ({ logs: [], unplanned: [] }) so the empty state is reachable too.
 */
export const MOCK_PLANNER_DAYS: Record<string, { logs: PlannerBlockLog[]; unplanned: PlannerUnplannedEntry[] }> = {
  [plannerDayKey(TL_TAYLOR, MOCK_DATE)]: { logs: MOCK_BLOCK_LOGS, unplanned: MOCK_UNPLANNED },
}

// ─── Daily activity ──────────────────────────────────────────────────────
//
// NOT in the agreed Section 5 schema (see types.ts's DailyActivityLog doc).
// One week (2026-09-21 .. 2026-09-25, Mon-Fri) for each of the 5 leaders,
// hand-varied rather than generated so the numbers read as plausible
// workdays. coaching_sessions / agent_in_seat / critical_fails feed
// lib/leadops/rollups.ts's weekly rollup.

const DAILY_WEEK_DATES = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']

export const MOCK_DAILY_WEEK_DATES = DAILY_WEEK_DATES

function daily(
  id: string,
  tlId: string,
  date: string,
  fields: {
    calls?: number
    tickets?: number
    audits?: number
    fails?: number
    coaching?: number
    inSeat?: boolean
    notes?: string | null
  },
): DailyActivityLog {
  return {
    id,
    tl_id: tlId,
    date,
    calls_listened: fields.calls ?? 0,
    tickets_reviewed: fields.tickets ?? 0,
    audits_completed: fields.audits ?? 0,
    critical_fails: fields.fails ?? 0,
    coaching_sessions: fields.coaching ?? 0,
    agent_in_seat: fields.inSeat ?? false,
    notes: fields.notes ?? null,
    created_at: '',
    updated_at: '',
  }
}

export const MOCK_DAILY_LOGS: DailyActivityLog[] = [
  // Taylor: a full week, including the day the Planner mock covers.
  daily('daily-tl1-mon', TL_TAYLOR, DAILY_WEEK_DATES[0], { calls: 3, tickets: 8, audits: 2, fails: 0, coaching: 1, inSeat: false }),
  daily('daily-tl1-tue', TL_TAYLOR, DAILY_WEEK_DATES[1], {
    calls: 4, tickets: 10, audits: 3, fails: 1, coaching: 1, inSeat: true,
    notes: 'Escalation absorbed the 10:30 coaching slot — see Time & Motion for the day.',
  }),
  daily('daily-tl1-wed', TL_TAYLOR, DAILY_WEEK_DATES[2], { calls: 2, tickets: 6, audits: 1, fails: 0, coaching: 0, inSeat: false }),
  daily('daily-tl1-thu', TL_TAYLOR, DAILY_WEEK_DATES[3], { calls: 5, tickets: 9, audits: 2, fails: 0, coaching: 2, inSeat: false }),
  daily('daily-tl1-fri', TL_TAYLOR, DAILY_WEEK_DATES[4], { calls: 3, tickets: 7, audits: 1, fails: 0, coaching: 1, inSeat: false }),

  // Jamie: a lighter week, one critical fail flagged with a note.
  daily('daily-tl2-mon', TL_JAMIE, DAILY_WEEK_DATES[0], { calls: 2, tickets: 5, audits: 1, fails: 0, coaching: 1, inSeat: false }),
  daily('daily-tl2-tue', TL_JAMIE, DAILY_WEEK_DATES[1], {
    calls: 2, tickets: 4, audits: 1, fails: 1, coaching: 0, inSeat: false,
    notes: 'Critical fail on a billing dispute — root-caused to a stale account note, coached same day.',
  }),
  daily('daily-tl2-wed', TL_JAMIE, DAILY_WEEK_DATES[2], { calls: 3, tickets: 6, audits: 2, fails: 0, coaching: 1, inSeat: true }),
  daily('daily-tl2-thu', TL_JAMIE, DAILY_WEEK_DATES[3], { calls: 2, tickets: 5, audits: 1, fails: 0, coaching: 0, inSeat: false }),
  daily('daily-tl2-fri', TL_JAMIE, DAILY_WEEK_DATES[4], { calls: 3, tickets: 6, audits: 1, fails: 0, coaching: 1, inSeat: false }),

  // Casey: the busiest week, two agent-in-seat days.
  daily('daily-tl3-mon', TL_CASEY, DAILY_WEEK_DATES[0], { calls: 6, tickets: 11, audits: 3, fails: 0, coaching: 2, inSeat: true }),
  daily('daily-tl3-tue', TL_CASEY, DAILY_WEEK_DATES[1], { calls: 5, tickets: 10, audits: 2, fails: 0, coaching: 1, inSeat: false }),
  daily('daily-tl3-wed', TL_CASEY, DAILY_WEEK_DATES[2], { calls: 4, tickets: 9, audits: 3, fails: 0, coaching: 1, inSeat: true }),
  daily('daily-tl3-thu', TL_CASEY, DAILY_WEEK_DATES[3], { calls: 5, tickets: 10, audits: 2, fails: 1, coaching: 2, inSeat: false }),
  daily('daily-tl3-fri', TL_CASEY, DAILY_WEEK_DATES[4], { calls: 4, tickets: 8, audits: 2, fails: 0, coaching: 1, inSeat: false }),

  // Riley: a quiet week, nothing entered on Wednesday (an empty-state day).
  daily('daily-tl4-mon', TL_RILEY, DAILY_WEEK_DATES[0], { calls: 1, tickets: 3, audits: 1, fails: 0, coaching: 0, inSeat: false }),
  daily('daily-tl4-tue', TL_RILEY, DAILY_WEEK_DATES[1], { calls: 2, tickets: 4, audits: 1, fails: 0, coaching: 1, inSeat: false }),
  daily('daily-tl4-thu', TL_RILEY, DAILY_WEEK_DATES[3], { calls: 2, tickets: 5, audits: 1, fails: 0, coaching: 1, inSeat: true }),
  daily('daily-tl4-fri', TL_RILEY, DAILY_WEEK_DATES[4], { calls: 1, tickets: 3, audits: 0, fails: 0, coaching: 0, inSeat: false }),

  // Avery (Billing): one full week.
  daily('daily-tl5-mon', TL_AVERY, DAILY_WEEK_DATES[0], { calls: 4, tickets: 7, audits: 2, fails: 0, coaching: 1, inSeat: false }),
  daily('daily-tl5-tue', TL_AVERY, DAILY_WEEK_DATES[1], { calls: 3, tickets: 6, audits: 1, fails: 0, coaching: 1, inSeat: true }),
  daily('daily-tl5-wed', TL_AVERY, DAILY_WEEK_DATES[2], { calls: 4, tickets: 8, audits: 2, fails: 0, coaching: 0, inSeat: false }),
  daily('daily-tl5-thu', TL_AVERY, DAILY_WEEK_DATES[3], { calls: 3, tickets: 5, audits: 1, fails: 0, coaching: 1, inSeat: false }),
  daily('daily-tl5-fri', TL_AVERY, DAILY_WEEK_DATES[4], { calls: 2, tickets: 4, audits: 1, fails: 0, coaching: 0, inSeat: false }),
]

// ─── Weekly activity log — 5 TLs x 4 weeks ──────────────────────────────

const WEEK_STARTS = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']

export const MOCK_WEEK_STARTS = WEEK_STARTS

/**
 * Only calibration + re_audits are genuinely manual weekly entries now —
 * coaching_sessions / agent_in_seat / critical_fails are rolled up from
 * MOCK_DAILY_LOGS by lib/leadops/rollups.ts and rendered read-only, so they
 * stay in this fixture (for weeks daily doesn't cover) but are no longer the
 * source of truth for the current week.
 */
export const MOCK_WEEKLY_LOGS: WeeklyManualLog[] = [
  weekly(TL_TAYLOR, 0, true, 3),
  weekly(TL_TAYLOR, 1, true, 2),
  weekly(TL_TAYLOR, 2, false, 4),
  weekly(TL_TAYLOR, 3, true, 3),
  weekly(TL_JAMIE, 0, true, 2),
  weekly(TL_JAMIE, 1, false, 1),
  weekly(TL_JAMIE, 2, true, 3),
  weekly(TL_JAMIE, 3, true, 2),
  weekly(TL_CASEY, 0, true, 5),
  weekly(TL_CASEY, 1, true, 4),
  weekly(TL_CASEY, 2, true, 4),
  weekly(TL_CASEY, 3, false, 1),
  weekly(TL_RILEY, 0, false, 1),
  weekly(TL_RILEY, 1, true, 3),
  weekly(TL_RILEY, 2, true, 2),
  weekly(TL_RILEY, 3, true, 3),
  weekly(TL_AVERY, 0, true, 2),
  weekly(TL_AVERY, 1, true, 3),
  weekly(TL_AVERY, 2, false, 1),
  weekly(TL_AVERY, 3, true, 2),
]

function weekly(
  tlId: string,
  weekIndex: number,
  calibration: boolean,
  reAudits: number,
): WeeklyManualLog {
  return {
    tl_id: tlId,
    week_of: WEEK_STARTS[weekIndex],
    calibration,
    re_audits: reAudits,
  }
}

export const MOCK_MANAGER_WEEKLY_LOGS: ManagerWeeklyLog[] = [
  { manager_id: MOCK_MANAGER.id, week_of: WEEK_STARTS[0], interactions_sampled: 12, calibration_spot_check: true, tl_one_on_ones: 4 },
  { manager_id: MOCK_MANAGER.id, week_of: WEEK_STARTS[1], interactions_sampled: 10, calibration_spot_check: false, tl_one_on_ones: 3 },
  { manager_id: MOCK_MANAGER.id, week_of: WEEK_STARTS[2], interactions_sampled: 15, calibration_spot_check: true, tl_one_on_ones: 4 },
  { manager_id: MOCK_MANAGER.id, week_of: WEEK_STARTS[3], interactions_sampled: 11, calibration_spot_check: true, tl_one_on_ones: 2 },
]

// ─── Manager Scorecard — month-picker config only ────────────────────────
//
// The actual data (TlTeamSize/ManagerKpaRating/ManagerMonthlyReview rows) is
// REAL now — see lib/leadops/realDataActions.ts and
// Database/migrations/leadops-manager-scorecard-real-tables-2026-10-01.sql.
// This file keeps only which months the picker offers, same role
// MOCK_WEEK_STARTS/MOCK_DAILY_WEEK_DATES play elsewhere in this file — not
// a mirror of a real table, just UI-visible config. All 5 real team leaders
// attach to Alex, per the source spec's explicit instruction, regardless
// of their real department spread (Social/T2/Billing vs Alex's own
// "Social Manager" department).

const MANAGER_MONTH = MOCK_PERIOD // '2026-09-01' — the month being scored
const MANAGER_PRIOR_MONTH = '2026-08-01'

/** The months the Manager Scorecard's month picker offers — oldest first. */
export const MOCK_MANAGER_MONTHS = [MANAGER_PRIOR_MONTH, MANAGER_MONTH]

