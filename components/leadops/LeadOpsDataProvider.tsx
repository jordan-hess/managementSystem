'use client'

/**
 * leadOps' single shared store — the thing that makes Data Entry → Planner /
 * Weekly Log / Scorecard / Reviews an actual pipeline instead of five tabs
 * each holding their own disconnected mock state.
 *
 * Six slices (daily logs, weekly logs, manager weekly logs, planner days,
 * KPI scores, performance reviews) consumed by five tabs is past the point
 * where prop-drilling reads well, so this is a React Context rather than
 * lifting state further up LeadOpsWorkspace — the pattern that file's own
 * comment already flagged as the "one piece of cross-tab behaviour" for
 * `scores` alone; this generalises it to everything Data Entry captures.
 *
 * REAL DATA (2026-10-01): `scores`, `tlTeamSizes`, `managerKpaRatings` and
 * `managerReviews` are no longer mock-seeded — they're fetched from the
 * real efficiency_scores/tl_team_sizes/manager_kpa_ratings/
 * manager_monthly_reviews tables (lib/leadops/realDataActions.ts) on mount,
 * and every mutator for them now persists to the database too. See
 * docs/manager-scorecard.md for the scope: this covers the Manager
 * Scorecard and the TL KPI actuals it rolls up from.
 *
 * REAL DATA (2026-10-09): Daily/Weekly Activity (`dailyLogs`, `weeklyLogs`,
 * `managerLogs`) are real too — loaded and saved through
 * lib/leadops/activityActions.ts, on their own load (last twelve weeks) so a
 * problem with those tables never affects the KPI/scorecard data. Time & Motion
 * (`plannerDays`) is real too — loaded and saved through
 * lib/leadops/plannerActions.ts — and Performance Reviews are real too (they
 * load through their own hooks, not this store); only the TL Efficiency
 * Scorecard is still Phase 0 mock state.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  MOCK_MANAGER_MONTHS,
  MOCK_PERIOD,
} from '@/lib/leadops/mockData'
import type { LeadOpsScope } from '@/lib/leadops/featureFlag'
import { canViewTeamLeaderData, isTeamLeader, type LeadOpsViewerContext } from '@/lib/leadops/permissions'
import { currentMonth, hourInSouthAfrica, plannerDayWindow, recentMonths, recentWeeks, todayInSouthAfrica, weekStartFor, type PlannerWindow } from '@/lib/leadops/periods'
import { fetchLeadOpsPlannerAction, savePlannerDayAction, type LeadOpsPlannerDay } from '@/lib/leadops/plannerActions'
import { PLANNER_MESSAGES, type PlannerDayInput } from '@/lib/leadops/plannerLimits'
import {
  fetchLeadOpsRealDataAction,
  upsertEfficiencyScoreAction,
  upsertManagerKpaRatingAction,
  upsertManagerMonthlyReviewAction,
  upsertTlTeamSizeAction,
} from '@/lib/leadops/realDataActions'
import {
  fetchLeadOpsActivityAction,
  upsertDailyLogAction,
  upsertManagerWeeklyLogAction,
  upsertWeeklyLogAction,
} from '@/lib/leadops/activityActions'
import { resolveTeamLeaderShiftAction } from '@/lib/leadops/rosterShiftAction'
import type { ResolvedTlShift } from '@/lib/leadops/rosterShiftMapping'
import { plannerDayKey } from '@/lib/leadops/types'
import type {
  DailyActivityLog,
  EfficiencyScore,
  ManagerKpaRating,
  ManagerMonthlyReview,
  ManagerWeeklyLog,
  PlannerBlockLog,
  PlannerUnplannedEntry,
  MockTeamLeader,
  LeadOpsPeople,
  RollupWeighting,
  TlTeamSize,
  WeeklyManualLog,
} from '@/lib/leadops/types'

interface PlannerDayState {
  logs: PlannerBlockLog[]
  unplanned: PlannerUnplannedEntry[]
}

interface PlannerLoad {
  key: string
  day: LeadOpsPlannerDay | null
  error: string | null
}

export type PlannerSaveResult = { ok: true; revision: number } | { ok: false; conflict: boolean; error: string }

interface LeadOpsDataValue {
  // ── data ──
  dailyLogs: DailyActivityLog[]
  weeklyLogs: WeeklyManualLog[]
  managerLogs: ManagerWeeklyLog[]
  /** Today's date in South Africa ('YYYY-MM-DD') — what "on the day" means for daily entries. */
  todayDate: string
  /** The Mondays offered by week pickers (twelve, newest first). */
  weekStarts: string[]
  /** True until the first activity load resolves. Separate from realDataLoading on purpose. */
  activityLoading: boolean
  /** Why the activity load failed (e.g. the tables are missing); KPI/scorecard data is unaffected. */
  activityError: string | null
  /** The loaded planner day for the selected team leader and date (same shape the Planner/Reviews tabs always read). */
  plannerDays: Record<string, PlannerDayState>
  plannerLoading: boolean
  plannerError: string | null
  /** Revision of the stored day (0 = never saved): send it back as expectedRevision when saving. */
  plannerRevision: number
  /** A saved block no longer matches the roster's shift: the day is read-only (see the spec, section 5). */
  plannerRosterMismatch: boolean
  /** Whether a planner date can be changed now: the day, plus until 12:00 SA the next day. */
  plannerWindowFor: (date: string) => PlannerWindow
  /**
   * The window at this very moment, from the real clock — for event handlers about to SEND (Save, Retry, the
   * `online` resend, Replace). Also moves the provider's clock forward, so the screens turn read-only with it.
   */
  plannerWindowNow: (date: string) => PlannerWindow
  reloadPlannerDay: () => void
  peekPlannerRevision: () => Promise<number | null>
  savePlannerDay: (day: PlannerDayInput, expectedRevision: number) => Promise<PlannerSaveResult>
  scores: EfficiencyScore[]

  // ── Manager Scorecard — real data (see realDataActions.ts), NOT in the agreed Section 5 schema ──
  tlTeamSizes: TlTeamSize[]
  managerKpaRatings: ManagerKpaRating[]
  managerReviews: ManagerMonthlyReview[]
  /** True until the initial fetchLeadOpsRealDataAction() load resolves — scores/tlTeamSizes/managerKpaRatings/managerReviews are all empty arrays until then, not yet "genuinely nothing recorded." */
  realDataLoading: boolean
  realDataError: string | null
  /** Set when a save was rejected or failed; the screen has been reloaded to what is really stored. Dismissable. */
  persistError: string | null
  dismissPersistError: () => void
  /** The one month KPI Actuals and the Manager Scorecard both work in ('YYYY-MM-01'). */
  selectedManagerMonth: string
  setSelectedManagerMonth: (month: string) => void
  /** Months offered by the pickers, newest first — generated from today's date, not a fixed list. */
  managerMonths: string[]
  /** 'prod' = only the real-data tabs; 'full' adds the Phase 0 mock tabs (SIT). */
  scope: LeadOpsScope
  /** The real team leaders this viewer may see (management: all; a team leader: just themself). */
  teamLeaders: MockTeamLeader[]
  /** The configured manager and reviewer (management/HOD only), or null with peopleError saying why. */
  people: LeadOpsPeople | null
  peopleError: string | null
  /** Config toggle so a roll-up can be checked side-by-side against an unweighted Excel figure during rollout. Defaults to 'team_size'. */
  rollupWeighting: RollupWeighting
  setRollupWeighting: (weighting: RollupWeighting) => void

  // ── shared context selectors (the "Team Leader: X · Week: Y" at the top of the page) ──
  selectedTlId: string
  setSelectedTlId: (id: string) => void
  selectedDate: string
  setSelectedDate: (date: string) => void
  selectedWeekStart: string
  setSelectedWeekStart: (weekStart: string) => void

  /**
   * The selected team leader's REAL roster-resolved shift for selectedDate
   * ("the system should read the team leader's roster and determine if
   * they are 08:00–17:00 or 11:00–20:00") — replaces the old manual "Shift
   * template" dropdown. null while resolving, or after a failed resolution
   * (see resolvedShiftError). Centralised here, rather than fetched by each
   * tab, so Data Entry's Time & Motion and the HOD's read-only Planner tab
   * always agree on which shift applies to the currently selected TL/date.
   */
  resolvedShift: ResolvedTlShift | null
  resolvedShiftLoading: boolean
  resolvedShiftError: string | null

  // ── mutators ──
  /** Resolve true once the server has saved the entry; false if it was refused or the call failed (the error is shown via persistError). */
  upsertDailyLog: (log: DailyActivityLog) => Promise<boolean>
  upsertWeeklyLog: (log: WeeklyManualLog) => Promise<boolean>
  upsertManagerLog: (log: ManagerWeeklyLog) => Promise<boolean>
  upsertScore: (score: EfficiencyScore) => void
  upsertTlTeamSize: (row: TlTeamSize) => void
  upsertManagerKpaRating: (rating: ManagerKpaRating) => void
  /** Creates a draft row if this manager/month has none yet — Manager Scorecard months aren't all pre-seeded. (TL Performance Reviews are real now and live in components/leadops/reviews, not in this provider.) */
  upsertManagerReview: (managerId: string, month: string, reviewerId: string, patch: Partial<ManagerMonthlyReview>) => void
}

const LeadOpsDataContext = createContext<LeadOpsDataValue | null>(null)

/** How often the Time & Motion window clock catches up with the real clock after mount. */
const PLANNER_CLOCK_TICK_MS = 30_000
/** What plannerDayWindow can tell apart about an instant: the South African day, and whether it is before 12:00. */
const windowPhase = (d: Date) => `${todayInSouthAfrica(d)}|${hourInSouthAfrica(d) < 12}`

interface ProviderProps {
  viewer: LeadOpsViewerContext
  scope: LeadOpsScope
  /** Today as an ISO date, passed down from the server so month lists are the same on server and client. */
  today: string
  /** The server's current instant (ISO), for the Time & Motion editing window. Defaults to 12:00 SA on `today`. */
  nowIso?: string
  children: ReactNode
}

export function LeadOpsDataProvider({ viewer, scope, today, nowIso, children }: ProviderProps) {
  // The mock-backed tabs (Daily/Weekly/Planner/Reviews) only exist in the full
  // scope; in the PROD scope their state starts empty so no invented figures can
  // reach a real user, even through the shared KPI derivations.
  const mockTabs = scope === 'full'
  const [dailyLogs, setDailyLogs] = useState<DailyActivityLog[]>([])
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyManualLog[]>([])
  const [managerLogs, setManagerLogs] = useState<ManagerWeeklyLog[]>([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState<string | null>(null)
  // "Today" in South Africa: starts as the date the server rendered the page with, and
  // moves forward if the tab is left open past midnight (see reportPersistFailure) —
  // otherwise an old tab would keep treating yesterday as the editable day.
  const [todayDate, setTodayDate] = useState(today)
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(weekStartFor(today))
  const weekStarts = useMemo(() => recentWeeks(todayDate, 12), [todayDate])
  const activityFrom = weekStarts[weekStarts.length - 1] // the oldest Monday in the window
  // The window clock: the server's instant for the first render (so server and client render the same), then the
  // real clock — ticking every 30 s after mount, and moved forward whenever a save fails or a send checks the window —
  // so a tab left open overnight, or past 12:00 the next day, stops showing the day as editable.
  const [clock, setClock] = useState(() => new Date(nowIso ?? `${today}T10:00:00Z`))
  // Only a change the window can see (the SA day, or crossing 12:00) re-renders the screens.
  const catchUpClock = useCallback((now: Date) => setClock((prev) => (windowPhase(prev) === windowPhase(now) ? prev : now)), [])
  useEffect(() => {
    const tick = setInterval(() => catchUpClock(new Date()), PLANNER_CLOCK_TICK_MS)
    return () => clearInterval(tick)
  }, [catchUpClock])
  const [scores, setScores] = useState<EfficiencyScore[]>([])

  const [tlTeamSizes, setTlTeamSizes] = useState<TlTeamSize[]>([])
  const [managerKpaRatings, setManagerKpaRatings] = useState<ManagerKpaRating[]>([])
  const [managerReviews, setManagerReviews] = useState<ManagerMonthlyReview[]>([])
  const [realDataLoading, setRealDataLoading] = useState(true)
  const [realDataError, setRealDataError] = useState<string | null>(null)
  // SIT's seeded data sits in Aug/Sep 2026, so the full scope keeps opening on
  // that period; the PROD scope opens on the current month.
  const [selectedManagerMonth, setSelectedManagerMonth] = useState<string>(mockTabs ? MOCK_PERIOD : currentMonth(today))
  const managerMonths = useMemo(() => {
    const months = recentMonths(today)
    if (!mockTabs) return months
    return [...new Set([...months, ...MOCK_MANAGER_MONTHS, MOCK_PERIOD])].sort().reverse()
  }, [today, mockTabs])
  const [teamLeaders, setTeamLeaders] = useState<MockTeamLeader[]>([])
  const [people, setPeople] = useState<LeadOpsPeople | null>(null)
  const [peopleError, setPeopleError] = useState<string | null>(null)
  const [rollupWeighting, setRollupWeighting] = useState<RollupWeighting>('team_size')
  // Latest reviews for event handlers (upsertManagerReview) that need to read the
  // current row synchronously instead of from inside a setState updater.
  const managerReviewsRef = useRef<ManagerMonthlyReview[]>([])
  useEffect(() => { managerReviewsRef.current = managerReviews }, [managerReviews])

  // Daily/weekly activity loads on its own (last twelve weeks), so a problem with
  // those tables is shown inside the activity screens only.
  const applyActivityResult = useCallback((result: Awaited<ReturnType<typeof fetchLeadOpsActivityAction>>) => {
    if (result.error !== undefined) { setActivityError(result.error); return }
    setDailyLogs(result.data.dailyLogs)
    setWeeklyLogs(result.data.weeklyLogs)
    setManagerLogs(result.data.managerLogs)
    setActivityError(null)
  }, [])

  // A load that throws (network, an old tab after a deploy) is an error state, never an
  // empty editable form — saving over a day we failed to load would overwrite its real figures.
  useEffect(() => {
    fetchLeadOpsActivityAction(activityFrom, todayDate)
      .then(applyActivityResult)
      .catch(() => setActivityError('Could not load activity data.'))
      .finally(() => setActivityLoading(false))
  }, [activityFrom, todayDate, applyActivityResult])

  // A failed save: say so, then reload the four real tables so the screen shows
  // what is actually stored (see upsertScore's comment for why a reload).
  const [persistError, setPersistError] = useState<string | null>(null)
  const dismissPersistError = useCallback(() => setPersistError(null), [])
  const reportPersistFailure = useCallback((error: string) => {
    const reason = error === 'Forbidden' ? 'you do not have permission to make this change.' : error
    setPersistError(`Your change was not saved: ${reason}`)
    // The reloads are best-effort: if one fails too, the banner above is still the truth.
    fetchLeadOpsRealDataAction().then((result) => {
      if (result.error !== undefined) return
      setScores(result.data.scores)
      setTlTeamSizes(result.data.tlTeamSizes)
      setManagerKpaRatings(result.data.managerKpaRatings)
      setManagerReviews(result.data.managerReviews)
    }).catch(() => {})

    // A tab left open past midnight still believes it is yesterday. If the South African
    // day has moved on, move "today" forward (and the selection with it, when it was on the
    // old today) — the effect above then reloads the window up to the new day. Otherwise
    // reload the current window: a refused save must not leave the screen ahead of the database.
    const nowToday = todayInSouthAfrica(new Date())
    catchUpClock(new Date())
    if (nowToday !== todayDate) {
      setTodayDate(nowToday)
      setSelectedDate((prev) => (prev === todayDate ? nowToday : prev))
      setSelectedWeekStart((prev) => (prev === weekStartFor(todayDate) ? weekStartFor(nowToday) : prev))
    } else {
      fetchLeadOpsActivityAction(activityFrom, todayDate).then(applyActivityResult).catch(() => {})
    }
  }, [activityFrom, todayDate, applyActivityResult, catchUpClock])

  // A team leader opens on their OWN record (their profile id is the tl_id the
  // KPI actuals are keyed by); management is pointed at the first real team
  // leader once the list loads (below).
  const [selectedTlId, setSelectedTlId] = useState<string>(isTeamLeader(viewer) ? viewer.profileId : '')

  // One-time load on mount — scores/tlTeamSizes/managerKpaRatings/
  // managerReviews all come from real tables now (realDataActions.ts),
  // replacing the old MOCK_EFFICIENCY_SCORES/MOCK_TL_TEAM_SIZES/
  // MOCK_MANAGER_KPA_RATINGS/MOCK_MANAGER_MONTHLY_REVIEW seeds. Fetched as
  // one combined call rather than per-tab, same reasoning as
  // resolvedShift's single shared fetch below.
  useEffect(() => {
    let cancelled = false
    fetchLeadOpsRealDataAction().then((result) => {
      if (cancelled) return
      if (result.error !== undefined) {
        setRealDataError(result.error)
      } else {
        setScores(result.data.scores)
        setTlTeamSizes(result.data.tlTeamSizes)
        setManagerKpaRatings(result.data.managerKpaRatings)
        setManagerReviews(result.data.managerReviews)
        setTeamLeaders(result.data.teamLeaders)
        setPeople(result.data.people)
        setPeopleError(result.data.peopleError)
        // Keep a valid team leader selected: a team leader stays on their own
        // record; management lands on the first real team leader.
        setSelectedTlId((prev) => (result.data.teamLeaders.some((t) => t.id === prev) ? prev : result.data.teamLeaders[0]?.id ?? prev))
        setRealDataError(null)
      }
      setRealDataLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  // ── Time & Motion — the selected team leader's day, loaded when the team leader or date changes ──
  const canViewPlanner = canViewTeamLeaderData(viewer)
  const [plannerLoad, setPlannerLoad] = useState<PlannerLoad | null>(null)
  const [plannerReloads, setPlannerReloads] = useState(0)
  const plannerKey = `${selectedTlId}|${selectedDate}`
  const plannerLoading = canViewPlanner && selectedTlId !== '' && plannerLoad?.key !== plannerKey
  const plannerCurrent = plannerLoad?.key === plannerKey ? plannerLoad : null
  const plannerDays = useMemo<Record<string, PlannerDayState>>(
    () => (plannerCurrent?.day ? { [plannerKey]: { logs: plannerCurrent.day.logs, unplanned: plannerCurrent.day.unplanned } } : {}),
    [plannerCurrent, plannerKey],
  )

  useEffect(() => {
    if (!canViewPlanner || !selectedTlId) return
    let cancelled = false
    const key = `${selectedTlId}|${selectedDate}`
    fetchLeadOpsPlannerAction(selectedTlId, selectedDate)
      .then((result) => {
        if (cancelled) return
        setPlannerLoad(result.error !== undefined ? { key, day: null, error: result.error } : { key, day: result.data, error: null })
      })
      // A load that throws is an error state, never an empty editable day (saving over a day we failed to load could overwrite it).
      .catch(() => { if (!cancelled) setPlannerLoad({ key, day: null, error: PLANNER_MESSAGES.loadFailed }) })
    return () => {
      cancelled = true
      // Whatever was loaded belongs to a request that is now superseded: drop it, so the screen shows loading until
      // THIS key's fresh load lands. Otherwise stepping A -> B -> A before B returns would show (and let the editor
      // mount on) the old A rows while a new fetch of A is in flight. Runs after commit, never during render.
      setPlannerLoad(null)
    }
  }, [canViewPlanner, selectedTlId, selectedDate, plannerReloads])

  const reloadPlannerDay = useCallback(() => {
    setPlannerLoad(null) // back to "loading", so the screen remounts on the freshly loaded day
    setPlannerReloads((n) => n + 1)
  }, [])

  const peekPlannerRevision = useCallback(async (): Promise<number | null> => {
    try {
      const result = await fetchLeadOpsPlannerAction(selectedTlId, selectedDate)
      return result.error !== undefined ? null : result.data.revision
    } catch {
      return null
    }
  }, [selectedTlId, selectedDate])

  const plannerWindowFor = useCallback((date: string) => plannerDayWindow(date, clock), [clock])
  const plannerWindowNow = useCallback((date: string) => {
    const now = new Date() // called from event handlers only, never during render
    catchUpClock(now)
    return plannerDayWindow(date, now)
  }, [catchUpClock])

  const [resolvedShift, setResolvedShift] = useState<ResolvedTlShift | null>(null)
  const [resolvedShiftError, setResolvedShiftError] = useState<string | null>(null)
  // The TL/date key the above two actually belong to — compared against the
  // CURRENT key to derive resolvedShiftLoading, rather than a separate
  // setState(true) at the top of the effect below (that would call setState
  // synchronously within the effect body, which react-hooks/set-state-in-
  // effect flags; deriving it avoids the extra call rather than suppressing
  // the lint rule).
  const [resolvedShiftKey, setResolvedShiftKey] = useState<string | null>(null)
  const currentShiftKey = `${selectedTlId}|${selectedDate}`
  const resolvedShiftLoading = resolvedShiftKey !== currentShiftKey

  // Re-resolves whenever the selected team leader or date changes. Guards
  // against a stale response landing after a newer request (e.g. rapidly
  // switching team leaders) with an effect-cleanup flag, since
  // resolveTeamLeaderShiftAction is a Server Action call, not an abortable
  // fetch.
  useEffect(() => {
    // Time & Motion consumes the resolved shift in both scopes.
    if (!selectedTlId) return
    let cancelled = false
    resolveTeamLeaderShiftAction(selectedTlId, selectedDate).then((result) => {
      if (cancelled) return
      // `!== undefined` rather than a truthy check: ActionResult's `error` is
      // a plain `string` in its error arm (not a literal type), so a truthy
      // check doesn't let TS discriminate the union and narrow `result.data`.
      if (result.error !== undefined) {
        setResolvedShift(null)
        setResolvedShiftError(result.error)
      } else {
        setResolvedShift(result.data)
        setResolvedShiftError(null)
      }
      setResolvedShiftKey(currentShiftKey)
    }).catch(() => {
      // A call that throws (network, an old tab after a deploy) is a resolution error, never "still loading" forever:
      // Data Entry waits for the shift before mounting Time & Motion.
      if (cancelled) return
      setResolvedShift(null)
      setResolvedShiftError('Could not resolve this team leader’s shift.')
      setResolvedShiftKey(currentShiftKey)
    })
    return () => { cancelled = true }
  }, [selectedTlId, selectedDate, currentShiftKey])

  // Optimistic like the KPI mutators: show the change at once, then replace it with
  // the server's row. A refusal (e.g. a day that has passed) or a call that throws
  // (server unreachable, a tab left open across a deploy) is SHOWN and the stored data is
  // reloaded — see upsertScore. Each resolves true only once the server has saved the entry,
  // so a screen's "Saved" tick can never appear for a save that did not happen.
  const UNREACHABLE = 'the server could not be reached — reload the page and try again.'

  const upsertDailyLog = useCallback((log: DailyActivityLog): Promise<boolean> => {
    const matches = (l: DailyActivityLog) => l.tl_id === log.tl_id && l.date === log.date
    setDailyLogs((prev) => (prev.some(matches) ? prev.map((l) => (matches(l) ? log : l)) : [...prev, log]))
    return upsertDailyLogAction(log).then((result) => {
      if (result.error !== undefined) { reportPersistFailure(result.error); return false }
      setDailyLogs((prev) => prev.map((l) => (matches(l) ? result.data : l)))
      return true
    }).catch(() => { reportPersistFailure(UNREACHABLE); return false })
  }, [reportPersistFailure])

  const upsertWeeklyLog = useCallback((log: WeeklyManualLog): Promise<boolean> => {
    const matches = (l: WeeklyManualLog) => l.tl_id === log.tl_id && l.week_of === log.week_of
    setWeeklyLogs((prev) => (prev.some(matches) ? prev.map((l) => (matches(l) ? log : l)) : [...prev, log]))
    return upsertWeeklyLogAction(log).then((result) => {
      if (result.error !== undefined) { reportPersistFailure(result.error); return false }
      setWeeklyLogs((prev) => prev.map((l) => (matches(l) ? result.data : l)))
      return true
    }).catch(() => { reportPersistFailure(UNREACHABLE); return false })
  }, [reportPersistFailure])

  const upsertManagerLog = useCallback((log: ManagerWeeklyLog): Promise<boolean> => {
    const matches = (l: ManagerWeeklyLog) => l.manager_id === log.manager_id && l.week_of === log.week_of
    setManagerLogs((prev) => (prev.some(matches) ? prev.map((l) => (matches(l) ? log : l)) : [...prev, log]))
    return upsertManagerWeeklyLogAction(log).then((result) => {
      if (result.error !== undefined) { reportPersistFailure(result.error); return false }
      setManagerLogs((prev) => prev.map((l) => (matches(l) ? result.data : l)))
      return true
    }).catch(() => { reportPersistFailure(UNREACHABLE); return false })
  }, [reportPersistFailure])

  // Saves the day as one unit. A revision conflict is NOT a generic failure: the screen offers the user
  // "Reload latest" / "Replace with my version", so it is reported to the caller without the banner.
  // Any other refusal or failure shows the banner; the typed day stays on screen (and in the device draft).
  const savePlannerDay = useCallback(async (day: PlannerDayInput, expectedRevision: number): Promise<PlannerSaveResult> => {
    const tlId = selectedTlId
    const date = selectedDate
    const key = `${tlId}|${date}`
    try {
      const result = await savePlannerDayAction({ tlId, date, expectedRevision, blocks: day.blocks, unplanned: day.unplanned })
      if (result.error !== undefined) {
        if (result.error === PLANNER_MESSAGES.conflict) return { ok: false, conflict: true, error: result.error }
        reportPersistFailure(result.error)
        return { ok: false, conflict: false, error: result.error }
      }
      const revision = result.data.revision
      // Keep the stored day in step with the confirmed save; the rows are refreshed best-effort below. (The screen
      // that saved tracks its own revision from this result — it never reads this one back to save against.)
      setPlannerLoad((prev) => (prev && prev.key === key && prev.day ? { ...prev, day: { ...prev.day, revision: Math.max(prev.day.revision, revision) } } : prev))
      fetchLeadOpsPlannerAction(tlId, date).then((fresh) => {
        if (fresh.error !== undefined) return
        // A lagging read (older than what we already hold) must never take the stored revision backwards.
        setPlannerLoad((prev) => (prev && prev.key === key && (!prev.day || fresh.data.revision >= prev.day.revision) ? { key, day: fresh.data, error: null } : prev))
      }).catch(() => {})
      return { ok: true, revision }
    } catch {
      reportPersistFailure(UNREACHABLE)
      return { ok: false, conflict: false, error: UNREACHABLE }
    }
  }, [selectedTlId, selectedDate, reportPersistFailure])

  // Optimistic: applies locally immediately (so typing/clicking feels
  // instant, same as before this was real), then persists in the
  // background and reconciles with the server's canonical row (real id/
  // updated_at) once it returns. A failed persist is SHOWN (persistError) and the
  // four real tables are reloaded from the server, so the screen never keeps a
  // value that was not saved. (Reloading, rather than restoring a remembered
  // "before" value, stays correct when several quick edits each fail.)
  const upsertScore = useCallback((score: EfficiencyScore) => {
    const matches = (s: EfficiencyScore) => s.tl_id === score.tl_id && s.period === score.period && s.metric_key === score.metric_key
    setScores((prev) => (prev.some(matches) ? prev.map((s) => (matches(s) ? score : s)) : [...prev, score]))
    upsertEfficiencyScoreAction(score).then((result) => {
      if (result.error !== undefined) { reportPersistFailure(result.error); return }
      setScores((prev) => prev.map((s) => (matches(s) ? result.data : s)))
    })
  }, [reportPersistFailure])

  const upsertTlTeamSize = useCallback((row: TlTeamSize) => {
    const matches = (r: TlTeamSize) => r.tl_id === row.tl_id && r.month === row.month
    setTlTeamSizes((prev) => (prev.some(matches) ? prev.map((r) => (matches(r) ? row : r)) : [...prev, row]))
    upsertTlTeamSizeAction(row).then((result) => {
      if (result.error !== undefined) { reportPersistFailure(result.error); return }
      setTlTeamSizes((prev) => prev.map((r) => (matches(r) ? result.data : r)))
    })
  }, [reportPersistFailure])

  const upsertManagerKpaRating = useCallback((rating: ManagerKpaRating) => {
    const matches = (r: ManagerKpaRating) => r.manager_id === rating.manager_id && r.month === rating.month && r.kpa_key === rating.kpa_key
    setManagerKpaRatings((prev) => (prev.some(matches) ? prev.map((r) => (matches(r) ? rating : r)) : [...prev, rating]))
    upsertManagerKpaRatingAction(rating).then((result) => {
      if (result.error !== undefined) { reportPersistFailure(result.error); return }
      setManagerKpaRatings((prev) => prev.map((r) => (matches(r) ? result.data : r)))
    })
  }, [reportPersistFailure])

  // Only the new STATUS (and the roll-up weighting the HOD is looking at) goes
  // to the server: the reviewer is the signed-in HOD and the locked snapshot is
  // recomputed from the database there. `patch.locked_snapshot` just makes the
  // optimistic row show the locked state immediately; the server's own row
  // (real snapshot) replaces it as soon as it returns.
  const upsertManagerReview = useCallback((managerId: string, month: string, reviewerId: string, patch: Partial<ManagerMonthlyReview>) => {
    const matches = (r: ManagerMonthlyReview) => r.manager_id === managerId && r.month === month
    const existing = managerReviewsRef.current.find(matches)
    const merged: ManagerMonthlyReview = existing
      ? { ...existing, ...patch }
      : {
          id: `manager-review-${managerId}-${month}`,
          manager_id: managerId,
          month,
          reviewer_id: reviewerId,
          status: 'draft',
          locked_snapshot: null,
          created_at: '',
          updated_at: '',
          ...patch,
        }
    setManagerReviews((prev) => (prev.some(matches) ? prev.map((r) => (matches(r) ? merged : r)) : [...prev, merged]))
    upsertManagerMonthlyReviewAction(managerId, month, merged.status, rollupWeighting).then((result) => {
      if (result.error !== undefined) { reportPersistFailure(result.error); return }
      setManagerReviews((prev) => prev.map((r) => (matches(r) ? result.data : r)))
    })
  }, [rollupWeighting, reportPersistFailure])

  const value = useMemo<LeadOpsDataValue>(() => ({
    dailyLogs,
    weeklyLogs,
    managerLogs,
    todayDate,
    weekStarts,
    activityLoading,
    activityError,
    plannerDays,
    plannerLoading,
    plannerError: plannerCurrent?.error ?? null,
    plannerRevision: plannerCurrent?.day?.revision ?? 0,
    plannerRosterMismatch: plannerCurrent?.day?.rosterMismatch ?? false,
    plannerWindowFor,
    plannerWindowNow,
    reloadPlannerDay,
    peekPlannerRevision,
    savePlannerDay,
    scores,
    tlTeamSizes,
    managerKpaRatings,
    managerReviews,
    realDataLoading,
    realDataError,
    persistError,
    dismissPersistError,
    selectedManagerMonth,
    setSelectedManagerMonth,
    managerMonths,
    scope,
    teamLeaders,
    people,
    peopleError,
    rollupWeighting,
    setRollupWeighting,
    selectedTlId,
    setSelectedTlId,
    selectedDate,
    setSelectedDate,
    selectedWeekStart,
    setSelectedWeekStart,
    resolvedShift,
    resolvedShiftLoading,
    resolvedShiftError,
    upsertDailyLog,
    upsertWeeklyLog,
    upsertManagerLog,
    upsertScore,
    upsertTlTeamSize,
    upsertManagerKpaRating,
    upsertManagerReview,
  }), [
    dailyLogs, weeklyLogs, managerLogs, todayDate, weekStarts, activityLoading, activityError, plannerDays, plannerCurrent,
    plannerLoading, plannerWindowFor, plannerWindowNow, reloadPlannerDay, peekPlannerRevision, savePlannerDay, scores,
    tlTeamSizes, managerKpaRatings, managerReviews, realDataLoading, realDataError, persistError, dismissPersistError,
    selectedManagerMonth, managerMonths, scope, teamLeaders, people, peopleError, rollupWeighting,
    selectedTlId, selectedDate, selectedWeekStart,
    resolvedShift, resolvedShiftLoading, resolvedShiftError,
    upsertDailyLog, upsertWeeklyLog, upsertManagerLog,
    upsertScore,
    upsertTlTeamSize, upsertManagerKpaRating, upsertManagerReview,
  ])

  return <LeadOpsDataContext.Provider value={value}>{children}</LeadOpsDataContext.Provider>
}

export function useLeadOpsData(): LeadOpsDataValue {
  const ctx = useContext(LeadOpsDataContext)
  if (!ctx) throw new Error('useLeadOpsData must be used within a LeadOpsDataProvider')
  return ctx
}

/** Planner day lookup, with the empty-day default so callers never handle undefined. */
export function plannerDayFor(plannerDays: Record<string, PlannerDayState>, tlId: string, date: string): PlannerDayState {
  return plannerDays[plannerDayKey(tlId, date)] ?? { logs: [], unplanned: [] }
}
