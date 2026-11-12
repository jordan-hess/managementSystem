import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LeadOpsDataProvider, useLeadOpsData } from './LeadOpsDataProvider'
import type { LeadOpsViewerContext } from '@/lib/leadops/permissions'
import type { PlannerDayInput } from '@/lib/leadops/plannerLimits'
import { PLANNER_MESSAGES as M } from '@/lib/leadops/plannerLimits'

jest.mock('@/lib/leadops/realDataActions', () => ({
  fetchLeadOpsRealDataAction: jest.fn(),
  upsertEfficiencyScoreAction: jest.fn(),
  upsertManagerKpaRatingAction: jest.fn(),
  upsertManagerMonthlyReviewAction: jest.fn(),
  upsertTlTeamSizeAction: jest.fn(),
}))
jest.mock('@/lib/leadops/activityActions', () => ({
  fetchLeadOpsActivityAction: jest.fn(),
  upsertDailyLogAction: jest.fn(),
  upsertWeeklyLogAction: jest.fn(),
  upsertManagerWeeklyLogAction: jest.fn(),
}))
jest.mock('@/lib/leadops/rosterShiftAction', () => ({ resolveTeamLeaderShiftAction: jest.fn() }))
jest.mock('@/lib/leadops/plannerActions', () => ({ fetchLeadOpsPlannerAction: jest.fn(), savePlannerDayAction: jest.fn() }))

import { fetchLeadOpsRealDataAction } from '@/lib/leadops/realDataActions'
import { fetchLeadOpsActivityAction } from '@/lib/leadops/activityActions'
import { resolveTeamLeaderShiftAction } from '@/lib/leadops/rosterShiftAction'
import { fetchLeadOpsPlannerAction, savePlannerDayAction } from '@/lib/leadops/plannerActions'

const fetchRealMock = fetchLeadOpsRealDataAction as jest.Mock
const fetchActivityMock = fetchLeadOpsActivityAction as jest.Mock
const resolveShiftMock = resolveTeamLeaderShiftAction as jest.Mock
const fetchPlannerMock = fetchLeadOpsPlannerAction as jest.Mock
const savePlannerMock = savePlannerDayAction as jest.Mock

const TODAY = '2026-10-08'
const tlViewer: LeadOpsViewerContext = { role: 'admin', hasTeamRow: true, profileId: 'tl-1' }
const plainAdmin: LeadOpsViewerContext = { role: 'admin', hasTeamRow: false, profileId: 'admin-1' }
const DAY: PlannerDayInput = {
  blocks: [{ template_block_id: 'tpl-early-b1', status: 'completed', actual_minutes: 30, actual_category: 'team_management', actual_activity: null, reason: null }],
  unplanned: [],
}
const STORED = { revision: 2, rosterMismatch: false, logs: [], unplanned: [] }

function Probe() {
  const d = useLeadOpsData()
  return (
    <div>
      <span data-testid="loading">{String(d.plannerLoading)}</span>
      <span data-testid="error">{d.plannerError ?? ''}</span>
      <span data-testid="revision">{d.plannerRevision}</span>
      <span data-testid="mismatch">{String(d.plannerRosterMismatch)}</span>
      <span data-testid="banner">{d.persistError ?? ''}</span>
      <span data-testid="shift-loading">{String(d.resolvedShiftLoading)}</span>
      <span data-testid="shift-error">{d.resolvedShiftError ?? ''}</span>
      <span data-testid="window-today">{JSON.stringify(d.plannerWindowFor('2026-10-08'))}</span>
      <span data-testid="window-yesterday">{JSON.stringify(d.plannerWindowFor('2026-10-07'))}</span>
      <button onClick={() => { void d.savePlannerDay(DAY, d.plannerRevision).then((r) => { (window as unknown as { result: unknown }).result = r }) }}>save</button>
      <button onClick={() => d.reloadPlannerDay()}>reload</button>
      <button onClick={() => { void d.peekPlannerRevision().then((r) => { (window as unknown as { peeked: unknown }).peeked = r }) }}>peek</button>
      <button onClick={() => d.setSelectedDate('2026-10-07')}>day-b</button>
      <button onClick={() => d.setSelectedDate(TODAY)}>day-a</button>
      <button onClick={() => { (window as unknown as { windowNow: unknown }).windowNow = d.plannerWindowNow('2026-10-07') }}>window-now</button>
    </div>
  )
}

const renderProvider = (viewer = tlViewer, nowIso?: string) =>
  render(<LeadOpsDataProvider viewer={viewer} scope="prod" today={TODAY} nowIso={nowIso}><Probe /></LeadOpsDataProvider>)
const text = (id: string) => screen.getByTestId(id).textContent
const lastResult = () => (window as unknown as { result: unknown }).result

beforeEach(() => {
  delete (window as unknown as { result?: unknown }).result // never read a previous test's save result
  fetchRealMock.mockReset()
  fetchActivityMock.mockReset()
  resolveShiftMock.mockReset()
  fetchPlannerMock.mockReset()
  savePlannerMock.mockReset()
  fetchRealMock.mockResolvedValue({ data: { scores: [], managerKpaRatings: [], managerReviews: [], tlTeamSizes: [], teamLeaders: [], people: null, peopleError: null } })
  fetchActivityMock.mockResolvedValue({ data: { dailyLogs: [], weeklyLogs: [], managerLogs: [] } })
  resolveShiftMock.mockResolvedValue({ data: { kind: 'early', startTime: '08:00:00', endTime: '17:00:00' } })
  fetchPlannerMock.mockResolvedValue({ data: STORED })
})

describe('planner slice of the provider', () => {
  it('loads the selected team leader\'s day and exposes its revision', async () => {
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(fetchPlannerMock).toHaveBeenCalledWith('tl-1', TODAY)
    expect(text('revision')).toBe('2')
    expect(text('mismatch')).toBe('false')
  })

  it('resolves the roster shift in the PROD scope too (Time & Motion needs it)', async () => {
    renderProvider()
    await waitFor(() => expect(resolveShiftMock).toHaveBeenCalledWith('tl-1', TODAY))
  })

  it('a roster-shift call that throws ends as a shift error, never as "still loading" (Data Entry waits for the shift)', async () => {
    resolveShiftMock.mockRejectedValue(new Error('Failed to fetch'))
    renderProvider()
    await waitFor(() => expect(text('shift-loading')).toBe('false'))
    expect(text('shift-error')).toBe('Could not resolve this team leader’s shift.')
  })

  it('does not fetch for someone who may not read planner data (a plain admin)', async () => {
    renderProvider(plainAdmin)
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(fetchPlannerMock).not.toHaveBeenCalled()
  })

  it('reports a refused or thrown load as a planner error, never as an empty day', async () => {
    fetchPlannerMock.mockResolvedValue({ error: M.loadFailed })
    const first = renderProvider()
    await waitFor(() => expect(text('error')).toBe(M.loadFailed))
    first.unmount()
    fetchPlannerMock.mockRejectedValue(new Error('network'))
    renderProvider()
    await waitFor(() => expect(text('error')).toBe(M.loadFailed))
  })

  it('exposes the roster mismatch flag', async () => {
    fetchPlannerMock.mockResolvedValue({ data: { ...STORED, rosterMismatch: true } })
    renderProvider()
    await waitFor(() => expect(text('mismatch')).toBe('true'))
  })

  it('a confirmed save resolves ok with the new revision and shows no error banner', async () => {
    savePlannerMock.mockResolvedValue({ data: { revision: 3 } })
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    // After the save the provider refetches the stored day, which now carries the new revision.
    fetchPlannerMock.mockResolvedValue({ data: { ...STORED, revision: 3 } })
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(lastResult()).toEqual({ ok: true, revision: 3 }))
    expect(savePlannerMock).toHaveBeenCalledWith({ tlId: 'tl-1', date: TODAY, expectedRevision: 2, blocks: DAY.blocks, unplanned: [] })
    await waitFor(() => expect(text('revision')).toBe('3'))
    expect(text('banner')).toBe('')
  })

  it('a revision conflict resolves as a conflict WITHOUT the generic banner (the screen offers the choices)', async () => {
    savePlannerMock.mockResolvedValue({ error: M.conflict })
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(lastResult()).toEqual({ ok: false, conflict: true, error: M.conflict }))
    expect(text('banner')).toBe('')
    expect(text('revision')).toBe('2') // unchanged
  })

  it('a refused save and a thrown save both show the banner and report failure (not a conflict)', async () => {
    savePlannerMock.mockResolvedValue({ error: M.windowClosed })
    const first = renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(lastResult()).toEqual({ ok: false, conflict: false, error: M.windowClosed }))
    expect(text('banner')).toBe(`Your change was not saved: ${M.windowClosed}`)
    first.unmount()

    savePlannerMock.mockRejectedValue(new Error('Failed to fetch'))
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(text('banner')).toContain('the server could not be reached'))
  })

  it('reloading shows the loading state and fetches the day again', async () => {
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    fetchPlannerMock.mockResolvedValue({ data: { ...STORED, revision: 7 } })
    fireEvent.click(screen.getByText('reload'))
    expect(text('loading')).toBe('true')
    await waitFor(() => expect(text('revision')).toBe('7'))
  })

  it('peeking at the revision returns it without changing the screen state', async () => {
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    fetchPlannerMock.mockResolvedValue({ data: { ...STORED, revision: 9 } })
    fireEvent.click(screen.getByText('peek'))
    await waitFor(() => expect((window as unknown as { peeked: unknown }).peeked).toBe(9))
    expect(text('revision')).toBe('2')
    expect(text('loading')).toBe('false')
  })

  it('answers the editing window from the clock it was given: yesterday is open before 12:00 SA and closed from 12:00', async () => {
    renderProvider(tlViewer, '2026-10-08T09:59:00Z')
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(text('window-today')).toBe('{"editable":true}')
    expect(text('window-yesterday')).toBe('{"editable":true}')
  })
  it('with no clock given, yesterday is closed (12:00 SA of today)', async () => {
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(text('window-yesterday')).toBe('{"editable":false,"reason":"closed"}')
  })
})

describe('planner slice — never a stale day under a fresh request', () => {
  it('A -> B -> A before B resolves shows loading (not the old A) until the fresh A arrives', async () => {
    renderProvider()
    await waitFor(() => expect(text('revision')).toBe('2'))
    let releaseA: (v: unknown) => void = () => {}
    fetchPlannerMock.mockImplementation((_tl: string, date: string) =>
      new Promise((resolve) => { if (date === TODAY) releaseA = resolve })) // B never answers
    fireEvent.click(screen.getByText('day-b'))
    expect(text('loading')).toBe('true')
    fireEvent.click(screen.getByText('day-a'))
    expect(text('loading')).toBe('true') // a fetch of A is in flight: the old A (revision 2) must not be shown
    expect(text('revision')).not.toBe('2')
    await act(async () => { releaseA({ data: { ...STORED, revision: 3 } }) })
    expect(text('loading')).toBe('false')
    expect(text('revision')).toBe('3')
  })

  it('a lagging post-save refetch with an older revision does not take the stored revision backwards', async () => {
    savePlannerMock.mockResolvedValue({ data: { revision: 3 } })
    renderProvider()
    await waitFor(() => expect(text('revision')).toBe('2'))
    let releaseRefetch: (v: unknown) => void = () => {}
    fetchPlannerMock.mockImplementation(() => new Promise((resolve) => { releaseRefetch = resolve }))
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(lastResult()).toEqual({ ok: true, revision: 3 }))
    expect(text('revision')).toBe('3')
    await act(async () => { releaseRefetch({ data: { ...STORED, revision: 2 } }) }) // e.g. a read that started before the commit
    expect(text('revision')).toBe('3')
  })
})

describe('planner slice — the window clock follows the real clock after mount', () => {
  afterEach(() => jest.useRealTimers())

  it('ticks: yesterday flips from editable to closed once 12:00 SA passes, without a save or a reload', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-08T09:59:00Z') }) // 11:59 SA
    renderProvider(tlViewer, '2026-10-08T09:59:00Z')
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(text('window-yesterday')).toBe('{"editable":true}')
    act(() => { jest.advanceTimersByTime(60_000) }) // 12:00 SA has passed
    expect(text('window-yesterday')).toBe('{"editable":false,"reason":"closed"}')
  })

  it('plannerWindowNow answers from the real clock at that moment and moves the screen\'s clock with it', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-08T09:59:00Z') })
    renderProvider(tlViewer, '2026-10-08T09:59:00Z')
    await waitFor(() => expect(text('loading')).toBe('false'))
    jest.setSystemTime(new Date('2026-10-08T10:05:00Z')) // 12:05 SA, before the next tick
    expect(text('window-yesterday')).toBe('{"editable":true}')
    fireEvent.click(screen.getByText('window-now'))
    expect((window as unknown as { windowNow: unknown }).windowNow).toEqual({ editable: false, reason: 'closed' })
    expect(text('window-yesterday')).toBe('{"editable":false,"reason":"closed"}')
  })
})
